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

	// Props
	let {
		steps = [],
		activeIndex = -1,
		onMarkerClick = (index: number) => {},
	}: {
		steps?: Step[];
		activeIndex?: number;
		onMarkerClick?: (index: number) => void;
	} = $props();

	// Map instance
	let mapContainer: HTMLDivElement;
	let map: mapboxgl.Map | null = null;

	// Extend marker to store step indices
	interface CustomMarker extends mapboxgl.Marker {
		_indices?: number[];
	}
	let markers: CustomMarker[] = [];

	// Neon cyan color for the route
	const ROUTE_COLOR = "#54b9ca";
	const MARKER_COLOR = "#54b9ca";

	let isMobile = $state(false);

	onMount(() => {
		isMobile = window.innerWidth <= 768;
		const handleResize = () => {
			isMobile = window.innerWidth <= 768;
		};
		window.addEventListener("resize", handleResize);
		return () => window.removeEventListener("resize", handleResize);
	});

	onMount(() => {
		mapboxgl.accessToken = MAPBOX_TOKEN;

		map = new mapboxgl.Map({
			container: mapContainer,
			style: "mapbox://styles/mapbox/dark-v11",
			center: [0, 20],
			zoom: 1.5,
			pitch: 0,
			bearing: 0,
			projection: "globe",
		});

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

	let activePadding = $derived(
		isMobile
			? { top: 180, bottom: 340, left: 0, right: 0 }
			: { top: 0, bottom: 0, left: 450, right: 0 },
	);

	// Fly to active step when activeIndex changes
	$effect(() => {
		if (map && activeIndex >= 0 && activeIndex < steps.length) {
			const step = steps[activeIndex];
			if (step.lat === null || step.lng === null) {
				// Global view for "Worldwide" steps
				map.flyTo({
					center: [0, 20],
					zoom: 1,
					duration: 2000,
					essential: true,
					padding: activePadding,
				});
			} else {
				map.flyTo({
					center: [step.lng, step.lat],
					zoom: 5,
					duration: 2000,
					essential: true,
					padding: activePadding,
				});
			}

			// Highlight the active marker
			markers.forEach((marker) => {
				const el = marker.getElement();
				// Check if this marker's group contains the active index
				if (marker._indices && marker._indices.includes(activeIndex)) {
					el.classList.add("active");
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
					][];

					// Add all points except the last one (to avoid duplicates)
					if (i < coordinates.length - 2) {
						allCoords.push(...arcCoords.slice(0, -1));
					} else {
						allCoords.push(...arcCoords);
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

				// Determine label (e.g. "1" or "1-3")
				const min = Math.min(...indices) + 1;
				const max = Math.max(...indices) + 1;
				const label = indices.length > 1 ? `${min}-${max}` : `${min}`;

				// Create custom marker element
				const el = document.createElement("div");
				el.className = "custom-marker";
				el.innerHTML = `
					<div class="marker-wrapper">
						<div class="marker-dot"></div>
						<div class="marker-pulse"></div>
						<div class="marker-label">${label}</div>
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
</script>

<div bind:this={mapContainer} class="map-container"></div>

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
		background: #54b9ca;
		border-radius: 50%;
		border: 3px solid #ffffff;
		box-shadow:
			0 0 15px #54b9ca,
			0 0 30px #54b9ca,
			0 2px 10px rgba(0, 0, 0, 0.5);
		transition:
			transform 0.3s ease,
			box-shadow 0.3s ease;
	}

	:global(.marker-pulse) {
		position: absolute;
		inset: 0;
		border: 3px solid #54b9ca;
		border-radius: 50%;
		opacity: 0;
		display: none;
	}

	:global(.custom-marker.active .marker-pulse) {
		display: block;
		animation: pulse-active 1s infinite;
		opacity: 1;
	}

	:global(.custom-marker.active .marker-dot) {
		transform: scale(1.3);
		background: #54b9ca;
		box-shadow:
			0 0 20px #54b9ca,
			0 0 40px #54b9ca,
			0 0 60px #54b9ca,
			0 2px 15px rgba(0, 0, 0, 0.5);
	}

	:global(.marker-label) {
		position: absolute;
		top: -30px;
		left: 50%;
		transform: translateX(-50%);
		background: #54b9ca;
		color: #0a0a0a;
		font-size: 12px;
		font-weight: 800;
		padding: 4px 10px;
		border-radius: 6px;
		white-space: nowrap;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
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
</style>
