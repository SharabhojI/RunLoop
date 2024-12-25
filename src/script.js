async function loadMapsAPI() {
    try {
        // Fetch the API key from the server
        const response = await fetch("/api/maps-api-key");
        const { apiKey } = await response.json();

        // Load the Google Maps API
        const script = document.createElement("script");
        script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initMap`;
        script.defer = true;
        script.async = true;
        document.body.appendChild(script);
    } catch (error) {
        console.error("Error loading Google Maps API: ", error);
    }
}

function initMap() {
    map = new google.maps.Map(document.getElementById("map"), {
        center: { lat: 40.7128, lng: -74.0060 },
        zoom: 8,
    });
}

function geocodeAddress() {
    const geocoder = new google.maps.Geocoder();
    const address = document.getElementById("location-input").value;

    geocoder.geocode({ address }, function (results, status) {
        if (status === "OK") {
            const location = results[0].geometry.location;
            map.setCenter(location);
            new google.maps.Marker({ map, position: location });
        } else {
            alert("Geocode was not successful for the following reason: " + status);
        }
    });
}

loadMapsAPI();