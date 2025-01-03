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
        map.setZoom(15);
    });
}

function geocodeAddress() {
    clearMarkers();
    clearRoutes();

    const geocoder = new google.maps.Geocoder();
    const address = document.getElementById("location-input").value;
    const totalDistance = parseFloat(document.getElementById("distance-input").value);
    
    if (!totalDistance || totalDistance <= 0) {
        alert("Please enter a valid distance");
        return;
    }

    geocoder.geocode({ address }, function (results, status) {
        if (status === "OK") {
            const startLocation = results[0].geometry.location;
            map.setCenter(startLocation);
            
            const startMarker = new google.maps.Marker({
                map: map,
                position: startLocation,
            });
            markers.push(startMarker);

            generateOutAndBack(startLocation, totalDistance);
        } else {
            alert("Geocode was not successful for the following reason: " + status);
        }
    });
}

function generateOutAndBack(startLocation, totalDistance) {
    const halfDistance = totalDistance / 2;
    const numDirections = 8; // 8 compass directions
    const angleStep = 360 / numDirections;
    
    // Clear existing routes
    clearRoutes();
    
    // Initialize route generation
    const routePromises = [];
    
    // Generate routes in different directions
    for (let i = 0; i < numDirections; i++) {
        const angle = i * angleStep;
        const destination = calculateDestinationPoint(startLocation, halfDistance, angle);
        
        routePromises.push(generateRoute(startLocation, destination, i));
    }

    // Process all routes
    Promise.all(routePromises)
        .then(routes => {
            const validRoutes = routes.filter(route => route !== null);
            if (validRoutes.length === 0) {
                alert("No valid routes found. Try a different distance or location.");
                return;
            }
            displayRoutes(validRoutes);
        })
        .catch(error => {
            console.error("Error generating routes:", error);
            alert("Error generating routes. Please try again.");
        });
}

function calculateDestinationPoint(start, distance, angle) {
    const point = turf.point([start.lng(), start.lat()]);
    const destination = turf.destination(point, distance, angle, { units: 'kilometers' });
    return new google.maps.LatLng(
        destination.geometry.coordinates[1], 
        destination.geometry.coordinates[0]
    );
}

function generateRoute(start, destination, index) {
    return new Promise((resolve, reject) => {
        const request = {
            origin: start,
            destination: destination,
            travelMode: google.maps.TravelMode.WALKING,
        };

        directionsService.route(request, (result, status) => {
            if (status === google.maps.DirectionsStatus.OK) {
                const renderer = new google.maps.DirectionsRenderer({
                    map: null, // Don't display immediately
                    directions: result,
                    suppressMarkers: true,
                    polylineOptions: {
                        strokeColor: "blue",
                        strokeOpacity: 0.5,
                    },
                });

                resolve({
                    index,
                    renderer,
                    routeDetails: result.routes[0],
                    outbound: true // Flag to indicate this is the outbound route
                });
            } else {
                resolve(null); // Return null for invalid routes
            }
        });
    });
}

function displayRoutes(routes) {
    const routesTable = document.getElementById("routes-table");
    const tbody = routesTable.getElementsByTagName("tbody")[0];
    tbody.innerHTML = "";

    routes.forEach((route, index) => {
        if (!route) return; // Skip null routes

        const row = tbody.insertRow();
        const selectionCell = row.insertCell(0);
        const routeNameCell = row.insertCell(1);
        const distanceCell = row.insertCell(2);

        const radioButton = document.createElement("input");
        radioButton.type = "radio";
        radioButton.name = "route";
        radioButton.value = index;
        radioButton.onclick = () => highlightRoute(index, routes);

        selectionCell.appendChild(radioButton);
        routeNameCell.textContent = `Route ${index + 1}`;

        // Double the distance for out and back
        const singleDistance = parseFloat(route.routeDetails.legs[0].distance.text);
        const totalDistance = (singleDistance * 2).toFixed(1);
        distanceCell.textContent = `${totalDistance} km`;

        // Select first route by default
        if (index === 0) {
            radioButton.checked = true;
            highlightRoute(index, routes);
        }
    });
}

function highlightRoute(index, routes) {
    // Clear all current routes
    clearRoutes();

    const selectedRoute = routes[index];
    if (!selectedRoute) return;

    // Show the selected route
    selectedRoute.renderer.setMap(map);

    // Create and show the return route
    const result = selectedRoute.renderer.getDirections();
    const returnResult = {
        routes: [{
            legs: [{
                steps: [...result.routes[0].legs[0].steps].reverse(),
                distance: result.routes[0].legs[0].distance,
                duration: result.routes[0].legs[0].duration,
                start_location: result.routes[0].legs[0].end_location,
                end_location: result.routes[0].legs[0].start_location
            }],
            overview_path: [...result.routes[0].overview_path].reverse()
        }]
    };

    const returnRenderer = new google.maps.DirectionsRenderer({
        map: map,
        directions: returnResult,
        suppressMarkers: true,
        polylineOptions: {
            strokeColor: "red",
            strokeOpacity: 0.5,
        },
    });

    directionsRenderers = [selectedRoute.renderer, returnRenderer];

    // Fit map bounds to show entire route
    const bounds = new google.maps.LatLngBounds();
    result.routes[0].overview_path.forEach(point => bounds.extend(point));
    map.fitBounds(bounds);
}

function clearMarkers() {
    markers.forEach(marker => marker.setMap(null));
    markers = [];
}

function clearRoutes() {
    directionsRenderers.forEach(renderer => {
        if (renderer) renderer.setMap(null);
    });
    directionsRenderers = [];
}