<script lang="ts">
	import { onMount, onDestroy } from "svelte";
	import mapboxgl from "mapbox-gl";
	import "mapbox-gl/dist/mapbox-gl.css";
	import { MAPBOX_TOKEN } from "$lib/config";
	import * as turf from "@turf/turf";

	interface Step {
		year: string;
		lat: number | null;
		lng: number | null;
		title: string;
		description: string;
	}

	interface FeaturedDish {
		name: string;
		emoji: string;
		region: string;
		trivia: string;
		lat: number;
		lng: number;
	}

	// Props
	let {
		steps = [],
		activeIndex = -1,
		onMarkerClick = (index: number) => {},
		featuredDishes = [],
		mode = "discovery",
		onFeaturedClick = (dish: FeaturedDish) => {},
		isLoading = false,
	}: {
		steps?: Step[];
		activeIndex?: number;
		onMarkerClick?: (index: number) => void;
		featuredDishes?: FeaturedDish[];
		mode?: "discovery" | "history";
		onFeaturedClick?: (dish: FeaturedDish) => void;
		isLoading?: boolean;
	} = $props();

	// Map instance
	let mapContainer: HTMLDivElement;
	let map: mapboxgl.Map | null = null;

	// Expose zoom methods for standard UI controls
	export function zoomIn() {
		if (map) map.zoomIn();
	}

	export function zoomOut() {
		if (map) map.zoomOut();
	}

	// Extend marker to store step indices
	interface CustomMarker extends mapboxgl.Marker {
		_indices?: number[];
	}
	let markers: CustomMarker[] = [];

	// Yellow/orange theme color for the route
	const ROUTE_COLOR = "#ff8c00";
	const MARKER_COLOR = "#ff8c00";

	let isMobile = $state(false);
	let screenHeight = $state(0);

	// Auto-rotate state for discovery mode
	let autoRotateEnabled = false;
	let autoRotateRafId: number | null = null;
	let inactivityTimerId: ReturnType<typeof setTimeout> | null = null;

	function startAutoRotate() {
		if (!map || autoRotateRafId !== null) return;
		autoRotateEnabled = true;
		const rotateSpeed = 0.015; // degrees per frame (~0.9 degrees per second at 60fps)

		function rotate() {
			if (!autoRotateEnabled || !map) {
				autoRotateRafId = null;
				return;
			}
			const center = map.getCenter();
			map.setCenter([center.lng + rotateSpeed, center.lat]);
			autoRotateRafId = requestAnimationFrame(rotate);
		}
		autoRotateRafId = requestAnimationFrame(rotate);
	}

	function stopAutoRotate() {
		autoRotateEnabled = false;
		if (autoRotateRafId !== null) {
			cancelAnimationFrame(autoRotateRafId);
			autoRotateRafId = null;
		}
	}

	function resetInactivityTimer() {
		if (inactivityTimerId) clearTimeout(inactivityTimerId);
		inactivityTimerId = setTimeout(() => {
			if (mode === "discovery" && !autoRotateEnabled) {
				startAutoRotate();
			}
		}, 10000); // 10 seconds of inactivity
	}

	onMount(() => {
		isMobile = window.innerWidth <= 768;
		screenHeight = window.innerHeight;
		const handleResize = () => {
			isMobile = window.innerWidth <= 768;
			screenHeight = window.innerHeight;
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	});

	let activePadding = $derived(
		isMobile
			? {
					top: mode === "discovery" ? 160 : 140, // Adjusted to push globe down accurately
					bottom: mode === "discovery" ? 180 : 350, // Decreased to use more space
					left: 0,
					right: 0,
				}
			: { top: 0, bottom: 0, left: 450, right: 0 },
	);

	onMount(() => {
		mapboxgl.accessToken = MAPBOX_TOKEN;

		map = new mapboxgl.Map({
			container: mapContainer,
			style: "mapbox://styles/mapbox/dark-v11",
			center: [20, 10], // Slightly adjusted for discovery view
			zoom: isMobile ? 1.1 : 1.5,
			pitch: 0,
			bearing: 0,
			projection: "globe",
		});

		map.setPadding(activePadding);

		map.on("load", () => {
			// Add atmosphere/fog for the globe view
			map!.setFog({
				color: "rgba(99, 193, 227, 0)", // Lower atmosphere color
				"high-color": "rgba(99, 193, 227, 0)", // Upper atmosphere color
				"horizon-blend": 0.05, // Increased blend for smoother transition
				"space-color": "rgb(11, 11, 11)", // Background color
				"star-intensity": 0.6, // Background stoar brightness (default 0.35 at low zooms )
			});

			// Add the route source (empty initially)
			map!.addSource("route", {
				type: "geojson",
				data: {
					type: "Feature",
					properties: {},
					geometry: {
						type: "LineString",
						coordinates: [],
					},
				},
			});

			// Add the route layer with neon glow effect
			map!.addLayer({
				id: "route-glow",
				type: "line",
				source: "route",
				layout: {
					"line-join": "round",
					"line-cap": "round",
				},
				paint: {
					"line-color": ROUTE_COLOR,
					"line-width": 8,
					"line-opacity": 0.3,
					"line-blur": 4,
				},
			});

			map!.addLayer({
				id: "route",
				type: "line",
				source: "route",
				layout: {
					"line-join": "round",
					"line-cap": "round",
				},
				paint: {
					"line-color": ROUTE_COLOR,
					"line-width": 3,
					"line-opacity": 0.9,
				},
			});

			// If steps already exist, draw them
			if (steps.length > 0) {
				updateRoute();
				addMarkers();
			}
		});

		// Disable scroll zoom for better UX with scrollytelling
		map.scrollZoom.disable();

		// Listen for user interactions to stop auto-rotate and start inactivity timer
		const interactionEvents = ["mousedown", "touchstart", "wheel"];
		function handleUserInteraction() {
			stopAutoRotate();
			resetInactivityTimer();
		}
		interactionEvents.forEach((evt) =>
			mapContainer.addEventListener(evt, handleUserInteraction, {
				passive: true,
			}),
		);
	});

	onDestroy(() => {
		if (map) {
			map.remove();
			map = null;
		}
	});

	// Update route when steps change
	$effect(() => {
		// Track steps.length to ensure reactivity
		const stepsCount = steps.length;

		if (map && stepsCount > 0) {
			// Wait for map to be fully loaded
			if (map.isStyleLoaded()) {
				console.log("Adding markers for", stepsCount, "steps");
				updateRoute();
				addMarkers();
			} else {
				// If style not loaded yet, wait for it
				map.once("styledata", () => {
					console.log(
						"Style loaded, adding markers for",
						stepsCount,
						"steps",
					);
					updateRoute();
					addMarkers();
				});
			}
		}
	});

	// Track previous step location to detect same-location transitions
	let prevStepLocation: { lat: number | null; lng: number | null } = {
		lat: null,
		lng: null,
	};
	let currentBearing = 0;

	// Helper to check if two locations are the same (within ~20km)
	function isSameLocation(
		lat1: number | null,
		lng1: number | null,
		lat2: number | null,
		lng2: number | null,
	): boolean {
		if (lat1 === null || lng1 === null || lat2 === null || lng2 === null)
			return false;
		const distance = turf.distance(
			turf.point([lng1, lat1]),
			turf.point([lng2, lat2]),
			{ units: "kilometers" },
		);
		return distance < 20;
	}

	// Fly to active step when activeIndex changes
	$effect(() => {
		if (map && activeIndex >= 0 && activeIndex < steps.length) {
			const step = steps[activeIndex];

			// Check if this is a same-location transition
			const sameLocation = isSameLocation(
				step.lat,
				step.lng,
				prevStepLocation.lat,
				prevStepLocation.lng,
			);

			if (step.lat === null || step.lng === null) {
				// Global view for "Worldwide" steps
				map.flyTo({
					center: [0, 20],
					zoom: 1,
					duration: 2000,
					essential: true,
					padding: activePadding,
				});
			} else if (sameLocation) {
				// Same location: subtle bearing rotation for visual feedback
				currentBearing = (currentBearing + 25) % 360;
				map.easeTo({
					center: [step.lng, step.lat],
					bearing: currentBearing,
					zoom: 5.2, // Slight zoom change
					duration: 1200,
					essential: true,
					padding: activePadding,
				});
			} else {
				// Different location: standard fly animation
				currentBearing = 0; // Reset bearing
				map.flyTo({
					center: [step.lng, step.lat],
					zoom: 5,
					bearing: 0,
					duration: 2000,
					essential: true,
					padding: activePadding,
				});
			}

			// Update previous location
			prevStepLocation = { lat: step.lat, lng: step.lng };

			// Highlight the active marker (and trigger pulse for same-location)
			markers.forEach((marker) => {
				const el = marker.getElement();
				// Check if this marker's group contains the active index
				if (marker._indices && marker._indices.includes(activeIndex)) {
					el.classList.add("active");

					// DYNAMIC LABEL UPDATE:
					// If this is a cluster, update the label to match the CURRENT active step's year
					// This fixes the issue where clusters only show the first step's year
					const yearLabel = el.querySelector(".marker-year-label");
					if (yearLabel) {
						yearLabel.textContent = step.year;
					}

					// For same-location transitions, add extra pulse effect
					if (sameLocation) {
						el.classList.add("same-location-pulse");
						setTimeout(
							() => el.classList.remove("same-location-pulse"),
							600,
						);
					}
				} else {
					el.classList.remove("active");
				}
			});
		}
	});

	// Compute clusters from steps (shared between route and markers)
	const CLUSTER_DISTANCE_KM = 20;

	function computeClusters(): {
		indices: number[];
		lat: number;
		lng: number;
	}[] {
		const clusters: { indices: number[]; lat: number; lng: number }[] = [];

		steps.forEach((step, index) => {
			if (step.lat === null || step.lng === null) return;

			// Find an existing cluster within range
			let addedToCluster = false;
			for (const cluster of clusters) {
				const distance = turf.distance(
					turf.point([step.lng, step.lat]),
					turf.point([cluster.lng, cluster.lat]),
					{ units: "kilometers" },
				);

				if (distance < CLUSTER_DISTANCE_KM) {
					cluster.indices.push(index);
					addedToCluster = true;
					break;
				}
			}

			// If no nearby cluster, create a new one
			if (!addedToCluster) {
				clusters.push({
					indices: [index],
					lat: step.lat,
					lng: step.lng,
				});
			}
		});

		return clusters;
	}

	function updateRoute() {
		if (!map || !map.getSource("route")) return;

		// Use clustered coordinates so line endpoints match marker positions
		const clusters = computeClusters();

		// Map each step index to its cluster's coordinates
		const stepToClusterCoord = new Map<number, [number, number]>();
		clusters.forEach((cluster) => {
			cluster.indices.forEach((idx) => {
				stepToClusterCoord.set(idx, [cluster.lng, cluster.lat]);
			});
		});

		// Build coordinates array using cluster positions
		// Only include unique cluster coordinates in order of first appearance
		const seenClusters = new Set<string>();
		const coordinates: [number, number][] = [];

		steps.forEach((step, index) => {
			if (step.lat === null || step.lng === null) return;
			const coord = stepToClusterCoord.get(index);
			if (coord) {
				const key = `${coord[0]},${coord[1]}`;
				if (!seenClusters.has(key)) {
					seenClusters.add(key);
					coordinates.push(coord);
				}
			}
		});

		let geometry: any = {
			type: "LineString",
			coordinates: coordinates,
		};

		// Create curved line using great circle arcs between each pair of points
		if (coordinates.length >= 2) {
			try {
				const allCoords: [number, number][] = [];

				for (let i = 0; i < coordinates.length - 1; i++) {
					const start = coordinates[i];
					const end = coordinates[i + 1];

					// Create a great circle arc between each pair
					const arc = turf.greatCircle(
						turf.point(start),
						turf.point(end),
						{ npoints: 50 },
					);

					// Get coordinates from the arc
					const arcCoords = arc.geometry.coordinates as [
						number,
						number,
						number,
					][];

					// Add all points except the last one (to avoid duplicates)
					if (i < coordinates.length - 2) {
						allCoords.push(
							...arcCoords
								.slice(0, -1)
								.map((c) => [c[0], c[1]] as [number, number]),
						);
					} else {
						allCoords.push(
							...arcCoords.map(
								(c) => [c[0], c[1]] as [number, number],
							),
						);
					}
				}

				geometry = {
					type: "LineString",
					coordinates: allCoords,
				};
			} catch (e) {
				console.warn("Failed to generate curved line:", e);
			}
		}

		(map.getSource("route") as mapboxgl.GeoJSONSource).setData({
			type: "Feature",
			properties: {},
			geometry,
		});
	}

	function addMarkers() {
		try {
			console.log("addMarkers called, activeIndex:", activeIndex);

			// Remove existing markers
			markers.forEach((m) => m.remove());
			markers = [];

			// Use shared clustering function
			const clusters = computeClusters();

			clusters.forEach((cluster) => {
				const { indices, lat, lng } = cluster;

				// Get the year for the first step in the cluster
				const firstStepIndex = indices[0];
				const step = steps[firstStepIndex];
				const yearLabel = step?.year || "";

				// Create custom marker element with year label
				const el = document.createElement("div");
				el.className = "custom-marker";
				el.innerHTML = `
					<div class="marker-wrapper">
						<div class="marker-year-label">${yearLabel}</div>
						<div class="marker-dot"></div>
					</div>
				`;

				// Add click handler to the marker element
				el.addEventListener("click", (e) => {
					e.stopPropagation();
					onMarkerClick(indices[0]);
				});

				const marker = new mapboxgl.Marker({ element: el })
					.setLngLat([lng, lat])
					.addTo(map!) as CustomMarker;

				// Store indices for active checking
				marker._indices = indices;

				markers.push(marker);
			});

			// Highlight the initial active marker
			if (markers.length > 0 && activeIndex >= 0) {
				markers.forEach((marker) => {
					const el = marker.getElement();
					if (
						marker._indices &&
						marker._indices.includes(activeIndex)
					) {
						el.classList.add("active");
					}
				});
			}
		} catch (e) {
			console.error("Error in addMarkers:", e);
		}

		// Fly to the active step location (outside try/catch so it runs even if markers fail)
		// This ensures map isn't stuck at default view
		if (activeIndex >= 0 && activeIndex < steps.length) {
			const step = steps[activeIndex];
			if (step) {
				if (step.lat === null || step.lng === null) {
					// Global view for "Worldwide" steps
					map?.flyTo({
						center: [0, 20],
						zoom: 1,
						duration: 2000,
						essential: true,
						padding: activePadding,
					});
				} else {
					console.log("Flying to step", activeIndex, [
						step.lng,
						step.lat,
					]);
					map?.flyTo({
						center: [Number(step.lng), Number(step.lat)],
						zoom: 5,
						duration: 2000,
						essential: true,
						padding: activePadding,
					});
				}
			}
		}
	}

	// Featured markers for discovery mode
	let featuredMarkers: mapboxgl.Marker[] = [];

	function addFeaturedMarkers() {
		if (!map) return;

		// Remove existing featured markers
		featuredMarkers.forEach((m) => m.remove());
		featuredMarkers = [];

		featuredDishes.forEach((dish) => {
			const displayEmoji = dish.emoji.length > 2 ? "🍲" : dish.emoji;
			// Create featured marker element with white label
			const el = document.createElement("div");
			el.className = "featured-marker";
			el.innerHTML = `
				<div class="featured-marker-content">
					<span class="featured-emoji">${displayEmoji}</span>
					<div class="featured-label">
						<span class="featured-name">${dish.name}</span>
						<span class="featured-region">${dish.region.toUpperCase()}</span>
					</div>
				</div>
			`;

			el.addEventListener("click", () => {
				onFeaturedClick(dish);
			});

			const marker = new mapboxgl.Marker({ element: el })
				.setLngLat([dish.lng, dish.lat])
				.addTo(map!);

			featuredMarkers.push(marker);
		});
	}

	function clearFeaturedMarkers() {
		featuredMarkers.forEach((m) => m.remove());
		featuredMarkers = [];
	}

	// Effect to handle featured dishes
	$effect(() => {
		const dishCount = featuredDishes.length;
		const currentMode = mode;

		if (map && currentMode === "discovery" && dishCount > 0) {
			if (map.isStyleLoaded()) {
				addFeaturedMarkers();
				// Move view to account for sidebar
				map.easeTo({
					center: [20, 10], // Center latitude for balanced view
					zoom: isMobile ? 1.1 : 1.8, // Zoom level adjusted for balanced mobile view
					padding: activePadding,
					duration: 2000,
				});
				// Start auto-rotate after the initial animation
				setTimeout(() => {
					if (mode === "discovery") startAutoRotate();
				}, 2500);
			} else {
				map.once("styledata", () => {
					addFeaturedMarkers();
					map!.easeTo({
						center: [20, 10],
						zoom: isMobile ? 1.1 : 1.8,
						padding: activePadding,
						duration: 2000,
					});
					setTimeout(() => {
						if (mode === "discovery") startAutoRotate();
					}, 2500);
				});
			}
		} else if (currentMode === "history") {
			stopAutoRotate();
			clearFeaturedMarkers();
		}
	});

	// Effect to clear route when switching to discovery mode
	$effect(() => {
		if (mode === "discovery" && map && map.getSource("route")) {
			(map!.getSource("route") as mapboxgl.GeoJSONSource).setData({
				type: "Feature",
				properties: {},
				geometry: {
					type: "LineString",
					coordinates: [],
				},
			});
			// Also clear history markers
			markers.forEach((m) => m.remove());
			markers = [];
		}
	});
</script>

<div class="map-wrapper" class:loading={isLoading}>
	<div bind:this={mapContainer} class="map-container"></div>
	{#if isLoading}
		<div class="loading-overlay"></div>
	{/if}
</div>

<style>
	.map-container {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	:global(.custom-marker) {
		/* Zero-size anchor point - Mapbox positions this at the coordinate */
		width: 0;
		height: 0;
		cursor: pointer;
		z-index: 10;
	}

	:global(.marker-wrapper) {
		position: absolute;
		width: 40px;
		height: 40px;
		/* Center the wrapper around the anchor point */
		transform: translate(-50%, -50%);
	}

	:global(.marker-dot) {
		position: absolute;
		inset: 8px;
		background: #ff8c00;
		border-radius: 50%;
		border: 3px solid #ffffff;
		box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
		transition:
			transform 0.3s ease,
			box-shadow 0.3s ease;
	}

	:global(.marker-pulse) {
		position: absolute;
		inset: 0;
		border: 3px solid #ff8c00;
		border-radius: 50%;
		opacity: 0;
		display: none;
	}

	:global(.custom-marker.active) {
		z-index: 50;
	}

	:global(.custom-marker.active .marker-pulse) {
		display: block;
		animation: pulse-active 1s infinite;
		opacity: 1;
	}

	:global(.custom-marker.active .marker-dot) {
		transform: scale(1.3);
		background: #ff8c00;
		box-shadow:
			0 0 20px #ff8c00,
			0 0 40px #ff8c00,
			0 0 60px #ff8c00,
			0 2px 15px rgba(0, 0, 0, 0.5);
	}

	/* Extra pulse animation for same-location step transitions */
	:global(.custom-marker.same-location-pulse .marker-dot) {
		animation: same-location-pop 0.6s ease-out;
	}

	@keyframes same-location-pop {
		0% {
			transform: scale(1.3);
		}
		30% {
			transform: scale(1.8);
			box-shadow:
				0 0 30px #ff8c00,
				0 0 60px #ff8c00,
				0 0 90px #ff8c00,
				0 2px 20px rgba(0, 0, 0, 0.5);
		}
		100% {
			transform: scale(1.3);
		}
	}

	:global(.marker-label) {
		position: absolute;
		top: -30px;
		left: 50%;
		transform: translateX(-50%);
		background: #ff8c00;
		color: #0a0a0a;
		font-size: 12px;
		font-weight: 800;
		padding: 4px 10px;
		border-radius: 6px;
		white-space: nowrap;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
	}

	:global(.marker-year-label) {
		position: absolute;
		top: -42px; /* Adjusted to make room for chevron */
		left: 50%;
		transform: translateX(-50%);
		background: rgba(255, 255, 255, 0.95);
		color: #111;
		font-size: 11px;
		font-weight: 700;
		padding: 4px 10px;
		border-radius: 6px;
		white-space: nowrap;
		box-shadow: 0 2px 12px rgba(0, 0, 0, 0.3);
		transition: all 0.3s ease;
	}

	/* Chevron / Tip */
	:global(.marker-year-label::after) {
		content: "";
		position: absolute;
		bottom: -6px;
		left: 50%;
		transform: translateX(-50%);
		border-left: 6px solid transparent;
		border-right: 6px solid transparent;
		border-top: 6px solid rgba(255, 255, 255, 0.95);
		transition: all 0.3s ease;
	}

	:global(.custom-marker.active .marker-year-label) {
		background: #ff8c00;
		color: #0c0c0c; /* Dark text on orange */
		box-shadow: 0 4px 15px rgba(255, 140, 0, 0.4);
		z-index: 100;
	}

	:global(.custom-marker.active .marker-year-label::after) {
		border-top-color: #ff8c00;
	}

	@keyframes pulse-active {
		0% {
			transform: scale(1);
			opacity: 1;
		}
		100% {
			transform: scale(3);
			opacity: 0;
		}
	}

	/* Map wrapper for loading state */
	.map-wrapper {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	.loading-overlay {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.2);
		pointer-events: none;
		z-index: 99;
	}

	/* Featured markers for discovery mode */
	:global(.featured-marker) {
		cursor: pointer;
		z-index: 10;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	:global(.featured-marker:hover) {
		transform: scale(1.05);
		z-index: 20;
	}

	:global(.featured-marker:hover .featured-marker-content) {
		background: rgba(75, 75, 75, 0.98);
		border-color: rgba(255, 255, 255, 0.3);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.6);
		transform: translate(-50%, calc(-100% - 14px));
	}

	:global(.featured-marker:hover .featured-marker-content::after) {
		border-top-color: rgba(75, 75, 75, 0.98);
	}

	:global(.featured-marker-content) {
		display: flex;
		flex-direction: row;
		align-items: center;
		gap: 8px;
		background: rgba(62, 62, 62, 0.85);
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		border: 1px solid rgba(255, 255, 255, 0.15);
		border-radius: 12px;
		padding: 8px 14px;
		transform: translate(-50%, calc(-100% - 10px));
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
		position: relative;
		transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
	}

	:global(.featured-marker-content::after) {
		content: "";
		position: absolute;
		bottom: -6px;
		left: 50%;
		width: 12px;
		height: 12px;
		background: inherit;
		backdrop-filter: inherit;
		-webkit-backdrop-filter: inherit;
		border-right: 1px solid rgba(255, 255, 255, 0.15);
		border-bottom: 1px solid rgba(255, 255, 255, 0.15);
		transform: translateX(-50%) rotate(45deg);
		border-bottom-right-radius: 2px;
		z-index: -1;
	}

	:global(.featured-emoji) {
		font-size: 1.35rem;
		line-height: 1;
		filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.3));
	}

	:global(.featured-label) {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0;
	}

	:global(.featured-name) {
		color: #ffffff;
		font-size: 0.8rem;
		font-weight: 600;
		white-space: nowrap;
		line-height: 1.2;
		letter-spacing: 0.01em;
	}

	:global(.featured-region) {
		color: rgba(255, 255, 255, 0.5);
		font-size: 0.6rem;
		font-weight: 600;
		white-space: nowrap;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		margin-top: 1px;
	}
</style>
