document.addEventListener("DOMContentLoaded", () => {
    loadMapsAPI();
});

async function loadMapsAPI() {
    try {
        const response = await fetch("/api/maps-api-key");
        const { apiKey } = await response.json();

        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places,geometry&callback=initMap`;
        script.defer = true;
        script.async = true;
        document.body.appendChild(script);
    } catch (error) {
        console.error("Error loading Google Maps API: ", error);
    }
}

let map;
let directionsService;
let directionsRenderers = [];
let routeInfo = [];
let markers = []; 
let circle; 

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 40.7128, lng: -74.0060 },
        zoom: 8,
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderers = [];

    const input = document.getElementById("location-input");
    const autocomplete = new google.maps.places.Autocomplete(input, {
        types: ["geocode"],
        componentRestrictions: { country: ["ca", "us"] },
        fields: ["place_id", "address_components", "geometry", "name"],
    });

    autocomplete.addListener("place_changed", () => {
        // Clear previous markers and circle
        clearMarkers();

        const place = autocomplete.getPlace();
        if (!place.geometry) {
            alert("Place not found");
            return;
        }

        map.setCenter(place.geometry.location);
        const originMarker = new google.maps.Marker({
            map: map,
            position: place.geometry.location,
        });
        markers.push(originMarker); 
        map.setZoom(20);
    });
}

function geocodeAddress() {
    // Clear previous markers and circle
    clearMarkers();

    const geocoder = new google.maps.Geocoder();
    const address = document.getElementById("location-input").value;
    const distance = parseFloat(document.getElementById("distance-input").value);

    geocoder.geocode({ address }, function (results, status) {
        if (status === "OK") {
            const location = results[0].geometry.location;
            map.setCenter(location);
            const originMarker = new google.maps.Marker({
                map: map,
                position: location,
            });
            markers.push(originMarker); 

            // Create a new circle for the location
            circle = new google.maps.Circle({
                map: map,
                center: location,
                radius: distance * 1000,
                strokeColor: "#FF0000",
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: "#FF0000",
                fillOpacity: 0.35,
            });

            // Generate points on the circle and plot them
            const circlePoints = generateCirclePoints(location, distance);
            plotPoint(circlePoints);

            // Generate routes to each point
            generateRoutes(location, circlePoints);
        } else {
            alert("Geocode was not successful for the following reason: " + status);
        }
    });
}

function generateCirclePoints(center, radius, numPoints = 12) {
    const turfCenter = [center.lng(), center.lat()];
    const turfCircle = turf.circle(turfCenter, radius, { steps: numPoints, units: "kilometers" });
    return turfCircle.geometry.coordinates[0];
}

function plotPoint(points) {
    points.forEach((point) => {
        const blueMarker = new google.maps.Marker({
            map: map,
            position: { lat: point[1], lng: point[0] },
            icon: {
                url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
            }
        });

        markers.push(blueMarker);
    });
}

function clearMarkers() {
    // Remove all markers
    markers.forEach(marker => marker.setMap(null));
    markers = []; // Clear the array

    // Clear the circle
    if (circle) {
        circle.setMap(null);
    }
}

function generateRoutes(location, points) {
    const routesTable = document.getElementById("routes-table");
    const tbody = routesTable.getElementsByTagName("tbody")[0];
    tbody.innerHTML = "";

    directionsRenderers = [];
    routeInfo = [];

    const sortedRoutes = points.map((point, index) => {
        const endPoint = { lat: point[1], lng: point[0] };
        const request = {
            origin: location,
            destination: endPoint,
            travelMode: "WALKING",
        };

        return new Promise((resolve, reject) => {
            directionsService.route(request, (result, status) => {
                if (status === google.maps.DirectionsStatus.OK) {
                    const renderer = new google.maps.DirectionsRenderer({
                        map: map,
                        directions: result,
                        suppressMarkers: true,
                    });

                    renderer.setOptions({
                        polylineOptions: {
                            strokeColor: "blue",
                            strokeOpacity: 0.5,
                        },
                    });

                    directionsRenderers.push(renderer);
                    routeInfo.push({ renderer, routeDetails: result.routes[0] });

                    resolve({
                        index,
                        routeDetails: result.routes[0],
                    });
                } else {
                    reject(`Error fetching directions for point ${index}: ${status}`);
                }
            });
        });
    });

    Promise.all(sortedRoutes)
        .then((routes) => {
            // Sort the routes based on their index
            routes.sort((a, b) => a.index - b.index);

            routes.forEach((routeData) => {
                const route = routeData.routeDetails;
                const row = tbody.insertRow();
                const selectionCell = row.insertCell(0);
                const routeNameCell = row.insertCell(1);
                const distanceCell = row.insertCell(2);

                const radioButton = document.createElement("input");
                radioButton.type = "radio";
                radioButton.name = "route";
                radioButton.value = routeData.index;
                radioButton.onclick = () => highlightRoute(routeData.index);

                selectionCell.appendChild(radioButton);
                routeNameCell.textContent = `Route ${routeData.index + 1}`;

                const routeDistance = route.legs[0].distance.text;
                distanceCell.textContent = routeDistance;

                // Select the first route by default
                if (routeData.index === 0) {
                    radioButton.checked = true;
                    highlightRoute(routeData.index);
                }
            });
        })
        .catch((error) => {
            console.error("Error generating routes:", error);
        });
}

function highlightRoute(index) {
    // Hide all routes
    directionsRenderers.forEach(renderer => renderer.setMap(null));

    // Show the selected route
    const selectedRoute = directionsRenderers[index];
    selectedRoute.setMap(map);

    // Deselect all radio buttons
    const radioButtons = document.querySelectorAll('input[name="route"]');
    radioButtons.forEach(radio => radio.checked = false);

    // Select the clicked radio button
    const clickedRadioButton = document.querySelector(`input[name="route"][value="${index}"]`);
    if (clickedRadioButton) {
        clickedRadioButton.checked = true;
    }
}
