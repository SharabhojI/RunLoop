// Default settings state
const settings = {
    distanceTolerance: 15,
    routeVariations: 8,
    avoidHighways: false,
    preferParks: false
};

// Constants that can be modified by settings
let DISTANCE_TOLERANCE = 0.15; // Default 15%
let ROUTE_VARIATIONS = 8;

document.addEventListener("DOMContentLoaded", () => {
    loadMapsAPI();
    loadSettings();
    document.getElementById('settings-toggle').addEventListener('click', toggleSettings);
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

function toggleSettings() {
    const panel = document.getElementById('settings-panel');
    panel.classList.toggle('active');
}

function updateSetting(setting, value) {
    settings[setting] = typeof value === 'string' ? parseFloat(value) : value;
    
    // Update display values for sliders
    if (setting === 'distanceTolerance') {
        document.getElementById('distance-tolerance-value').textContent = `${value}%`;
        DISTANCE_TOLERANCE = value / 100;
    } else if (setting === 'routeVariations') {
        document.getElementById('route-variations-value').textContent = value;
        ROUTE_VARIATIONS = parseInt(value);
    }
    
    // Store settings in localStorage
    localStorage.setItem('runloop_settings', JSON.stringify(settings));
}

function loadSettings() {
    const savedSettings = localStorage.getItem('runloop_settings');
    if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        Object.assign(settings, parsed);
        
        // Update UI to reflect loaded settings
        document.getElementById('distance-tolerance').value = settings.distanceTolerance;
        document.getElementById('distance-tolerance-value').textContent = `${settings.distanceTolerance}%`;
        document.getElementById('route-variations').value = settings.routeVariations;
        document.getElementById('route-variations-value').textContent = settings.routeVariations;
        document.getElementById('avoid-highways').checked = settings.avoidHighways;
        document.getElementById('prefer-parks').checked = settings.preferParks;
        
        // Update constants
        DISTANCE_TOLERANCE = settings.distanceTolerance / 100;
        ROUTE_VARIATIONS = settings.routeVariations;
    }
}

function geocodeAddress() {
    clearMarkers();
    clearRoutes();

    const button = document.querySelector('#inputs-container input[type="button"]');
    button.classList.add('loading');
    const originalText = button.value;
    button.value = '';

    const geocoder = new google.maps.Geocoder();
    const address = document.getElementById("location-input").value;
    const totalDistance = parseFloat(document.getElementById("distance-input").value);
    
    if (!totalDistance || totalDistance <= 0) {
        alert("Please enter a valid distance");
        button.classList.remove('loading');
        button.value = originalText;
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

            const routeType = document.querySelector('input[name="routeType"]:checked').value;
            if (routeType === 'outAndBack') {
                generateOutAndBack(startLocation, totalDistance);
            } else {
                generateLoop(startLocation, totalDistance);
            }
        } else {
            alert("Geocode was not successful for the following reason: " + status);
        }
        button.classList.remove('loading');
        button.value = originalText;
    });
}

async function generateOptimizedRoute(start, targetDistance, angle, isLoop = false) {
    let currentDistance = targetDistance;
    let iteration = 0;
    let bestRoute = null;
    let bestDistanceDiff = Infinity;

    while (iteration < 3) {
        const destination = calculateDestinationPoint(
            start, 
            isLoop ? currentDistance * 0.25 : currentDistance * 0.5, 
            angle
        );

        const route = await generateRoute(start, destination, 0, isLoop);
        
        if (!route) {
            iteration++;
            currentDistance *= 0.8; // Try a shorter distance if route fails
            continue;
        }

        const routeDistance = isLoop ? 
            parseFloat(route.routeDetails.legs[0].distance.text) :
            parseFloat(route.routeDetails.legs[0].distance.text) * 2;

        const distanceDiff = Math.abs(routeDistance - targetDistance);
        
        // Check if this route is better than our previous best
        if (distanceDiff < bestDistanceDiff) {
            bestRoute = route;
            bestDistanceDiff = distanceDiff;
        }

        // If within tolerance, return this route
        if (distanceDiff / targetDistance <= DISTANCE_TOLERANCE) {
            return route;
        }

        // Adjust distance for next iteration
        const ratio = targetDistance / routeDistance;
        currentDistance *= ratio;
        iteration++;
    }

    // Return best route found if we couldn't get within tolerance
    return bestRoute;
}

async function generateOptimizedRoutes(startLocation, totalDistance, isLoop = false) {
    const angleStep = 360 / ROUTE_VARIATIONS;
    const routePromises = [];
    
    for (let i = 0; i < ROUTE_VARIATIONS; i++) {
        const angle = i * angleStep;
        routePromises.push(generateOptimizedRoute(startLocation, totalDistance, angle, isLoop));
    }

    const routes = await Promise.all(routePromises);
    const validRoutes = routes.filter(route => route !== null)
        .sort((a, b) => {
            const distA = getRouteDistance(a, isLoop);
            const distB = getRouteDistance(b, isLoop);
            const diffA = Math.abs(distA - totalDistance);
            const diffB = Math.abs(distB - totalDistance);
            return diffA - diffB;
        });

    if (validRoutes.length < 3) {
        throw new Error("Insufficient valid routes found");
    }

    // Return the best routes
    return validRoutes.slice(0, 5);
}

function getRouteDistance(route, isLoop) {
    const singleDistance = parseFloat(route.routeDetails.legs[0].distance.text);
    return isLoop ? singleDistance : singleDistance * 2;
}

function calculateDestinationPoint(start, distance, angle) {
    const point = turf.point([start.lng(), start.lat()]);
    const destination = turf.destination(point, distance, angle, { units: 'kilometers' });
    return new google.maps.LatLng(
        destination.geometry.coordinates[1], 
        destination.geometry.coordinates[0]
    );
}

function generateRoute(start, destination, index, isLoop = false) {
    return new Promise((resolve, reject) => {
        const request = {
            ...(isLoop ? {
                origin: start,
                destination: start,
                waypoints: [{ location: destination, stopover: false }],
            } : {
                origin: start,
                destination: destination,
            }),
            travelMode: google.maps.TravelMode.WALKING,
            avoidHighways: settings.avoidHighways
        };

        if (settings.preferParks) {
            request.provideRouteAlternatives = true;
        }

        directionsService.route(request, (result, status) => {
            if (status === google.maps.DirectionsStatus.OK) {
                const renderer = new google.maps.DirectionsRenderer({
                    map: null,
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
                    isLoop: isLoop
                });
            } else {
                resolve(null);
            }
        });
    });
}

function generateLoop(startLocation, totalDistance) {
    clearRoutes();
    
    generateOptimizedRoutes(startLocation, totalDistance, true)
        .then(routes => {
            displayRoutes(routes);
        })
        .catch(error => {
            console.error("Error generating routes:", error);
            alert("Error finding suitable routes. Try a different distance or location.");
        });
}

function generateOutAndBack(startLocation, totalDistance) {
    clearRoutes();
    
    generateOptimizedRoutes(startLocation, totalDistance, false)
        .then(routes => {
            displayRoutes(routes);
        })
        .catch(error => {
            console.error("Error generating routes:", error);
            alert("Error finding suitable routes. Try a different distance or location.");
        });
}

function displayRoutes(routes) {
    const routesTable = document.getElementById("routes-table");
    const tbody = routesTable.getElementsByTagName("tbody")[0];
    tbody.innerHTML = "";

    routes.forEach((route, index) => {
        if (!route) return;

        const row = tbody.insertRow();
        row.className = 'route-row';
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

        const singleDistance = parseFloat(route.routeDetails.legs[0].distance.text);
        const totalDistance = route.isLoop ? singleDistance.toFixed(1) : (singleDistance * 2).toFixed(1);
        
        const badge = document.createElement("div");
        badge.className = `distance-badge ${getDistanceBadgeClass(totalDistance)}`;
        badge.textContent = `${totalDistance} km`;
        distanceCell.appendChild(badge);

        if (index === 0) {
            radioButton.checked = true;
            row.classList.add('active');
            highlightRoute(index, routes);
        }
    });
}

function getDistanceBadgeClass(distance) {
    if (distance <= 5) return 'short';
    if (distance <= 10) return 'medium';
    return 'long';
}

function highlightRoute(index, routes) {
    clearRoutes();

    const rows = document.querySelectorAll('.route-row');
    rows.forEach(row => row.classList.remove('active'));
    rows[index].classList.add('active');

    const selectedRoute = routes[index];
    if (!selectedRoute) return;
    let result;

    if (selectedRoute.isLoop) {
        selectedRoute.renderer.setMap(map);
        directionsRenderers = [selectedRoute.renderer];
        result = selectedRoute.renderer.getDirections();
    } else {
        selectedRoute.renderer.setMap(map);
        result = selectedRoute.renderer.getDirections();

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
    }

    const bounds = new google.maps.LatLngBounds();
    result.routes[0].overview_path.forEach(point => bounds.extend(point));
    map.fitBounds(bounds);
}

function clearRoutes() {
    directionsRenderers.forEach(renderer => {
        if (renderer) renderer.setMap(null);
    });
    directionsRenderers = [];
}

function clearMarkers() {
    markers.forEach(marker => marker.setMap(null));
    markers = [];
}