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
let directionsRenderer;

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 40.7128, lng: -74.0060 },
        zoom: 8,
    });

    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer();
    directionsRenderer.setMap(map);

    const input = document.getElementById("location-input");
    const autocomplete = new google.maps.places.Autocomplete(input, {
        types: ["geocode"],
        componentRestrictions: { country: ["ca", "us"] },
        fields: ["place_id", "address_components", "geometry", "name"],
    });

    autocomplete.addListener("place_changed", () => {
        // Clear previous marker and circle
        if (map.marker) {
            map.marker.setMap(null);
        }
        if (map.circle) {
            map.circle.setMap(null);
        }

        const place = autocomplete.getPlace();
        if (!place.geometry) {
            alert("Place not found");
            return;
        }

        map.setCenter(place.geometry.location);
        map.marker = new google.maps.Marker({ map, position: place.geometry.location });
        map.setZoom(20);
    });
}

function geocodeAddress() {
    // Clear previous marker and circle
    if (map.marker) {
        map.marker.setMap(null);
    }
    if (map.circle) {
        map.circle.setMap(null);
    }

    const geocoder = new google.maps.Geocoder();
    const address = document.getElementById("location-input").value;
    const distance = parseFloat(document.getElementById("distance-input").value);

    geocoder.geocode({ address }, function (results, status) {
        if (status === "OK") {
            const location = results[0].geometry.location;
            map.setCenter(location);
            map.marker = new google.maps.Marker({ map, position: location });

            map.circle = new google.maps.Circle({
                map: map,
                center: location,
                radius: distance * 1000,
                strokeColor: "#FF0000",
                strokeOpacity: 0.8,
                strokeWeight: 2,
                fillColor: "#FF0000",
                fillOpacity: 0.35,
            });
        } else {
            alert("Geocode was not successful for the following reason: " + status);
        }
    });
}

loadMapsAPI();