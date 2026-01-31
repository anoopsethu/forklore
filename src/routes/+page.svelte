<script lang="ts">
    import { onMount } from "svelte";
    import { fade, fly } from "svelte/transition";
    import Map from "$lib/components/Map.svelte";
    import FeaturedDishCard from "$lib/components/FeaturedDishCard.svelte";
    import { Input } from "$lib/components/ui/input";
    import * as Card from "$lib/components/ui/card";
    import { Skeleton } from "$lib/components/ui/skeleton";
    import { Button } from "$lib/components/ui/button";
    import Icon from "@iconify/svelte";

    interface Step {
        year: string;
        lat: number | null;
        lng: number | null;
        title: string;
        description: string;
    }

    interface DishHistory {
        title: string;
        emoji: string;
        stats: {
            yearsOld: string;
            servingsPerYear: string;
            globalReach: string;
        };
        steps: Step[];
    }

    interface FeaturedDish {
        name: string;
        emoji: string;
        region: string;
        trivia: string;
        lat: number;
        lng: number;
    }

    // State
    let searchQuery = $state("");
    let isSearching = $state(false);
    let hasSearched = $state(false);
    let dishHistory = $state<DishHistory | null>(null);
    let error = $state<string | null>(null);
    let activeCardIndex = $state(-1);

    // Featured dishes state
    let featuredDishes = $state<FeaturedDish[]>([]);
    let isLoadingFeatured = $state(true);
    let isLoadingHistory = $state(false);

    // Map mode: discovery (globe with featured) or history (timeline view)
    let mapMode = $derived<"discovery" | "history">(
        hasSearched ? "history" : "discovery",
    );

    // Card elements for intersection observer
    let cardElements: HTMLElement[] = [];
    let cardsContainer = $state<HTMLElement | null>(null);
    let sealElement = $state<HTMLElement | null>(null);
    let sealVisible = $state(false);
    let isMobile = $state(false);

    // Playback controls state
    let isPlaying = $state(false);
    let wasPlaying = $state(false); // Track if playback has been initiated
    let playbackIntervalId: ReturnType<typeof setInterval> | null = null;
    let playbackStartTime = $state(0); // Timestamp when playback started
    let playbackAnimationId: number | null = null; // For requestAnimationFrame
    let smoothProgress = $state(0); // 0-100, updated every frame

    const STEP_DURATION = 4000; // 4 seconds per step

    // Progress bar percentage for mobile movie mode (smooth continuous)
    let progressPercent = $derived(smoothProgress);

    // Animation loop for smooth progress
    function animateProgress() {
        if (!dishHistory || !isPlaying) return;

        const totalDuration = dishHistory.steps.length * STEP_DURATION;
        const elapsed = Date.now() - playbackStartTime;
        const progress = Math.min((elapsed / totalDuration) * 100, 100);

        smoothProgress = progress;

        // Calculate which step we should be on based on elapsed time
        const expectedStep = Math.floor(elapsed / STEP_DURATION);
        if (
            expectedStep !== activeCardIndex &&
            expectedStep < dishHistory.steps.length
        ) {
            // First scroll to the card (this sets activeCardIndex internally)
            scrollToCard(expectedStep);
        }

        // Continue animation or stop at end
        if (elapsed < totalDuration) {
            playbackAnimationId = requestAnimationFrame(animateProgress);
        } else {
            // Playback complete - reset to beginning
            handlePause();
            smoothProgress = 0;
            activeCardIndex = 0;
            scrollToCard(0);
        }
    }

    // Playback control functions
    function handlePlay() {
        if (!dishHistory || dishHistory.steps.length === 0) return;

        isPlaying = true;
        wasPlaying = true;

        // If at the end, reset to start
        if (activeCardIndex >= dishHistory.steps.length - 1) {
            activeCardIndex = 0;
            scrollToCard(0);
            smoothProgress = 0;
        }

        // Calculate start time based on current position
        const totalDuration = dishHistory.steps.length * STEP_DURATION;
        const currentProgress = smoothProgress / 100;
        playbackStartTime = Date.now() - currentProgress * totalDuration;

        // Start animation loop
        playbackAnimationId = requestAnimationFrame(animateProgress);
    }

    function handlePause() {
        isPlaying = false;
        if (playbackIntervalId) {
            clearInterval(playbackIntervalId);
            playbackIntervalId = null;
        }
        if (playbackAnimationId) {
            cancelAnimationFrame(playbackAnimationId);
            playbackAnimationId = null;
        }
    }

    function handleReset() {
        handlePause();
        activeCardIndex = 0;
        scrollToCard(0);
        smoothProgress = 0;
    }

    function handleStop() {
        handlePause();
        activeCardIndex = 0;
        scrollToCard(0);
        smoothProgress = 0;
    }

    // Handle click/tap on the progress bar to jump to a step
    function handleProgressClick(e: MouseEvent) {
        if (!dishHistory) return;
        const bar = e.currentTarget as HTMLElement;
        const rect = bar.getBoundingClientRect();
        const clickX = e.clientX - rect.left;
        const percent = clickX / rect.width;
        const stepIndex = Math.floor(percent * dishHistory.steps.length);
        const clampedIndex = Math.max(
            0,
            Math.min(stepIndex, dishHistory.steps.length - 1),
        );
        activeCardIndex = clampedIndex;
        scrollToCard(clampedIndex);

        // Update smooth progress to match the clicked position
        smoothProgress = percent * 100;

        // If playing, recalculate start time so animation continues from new position
        if (isPlaying && dishHistory) {
            const totalDuration = dishHistory.steps.length * STEP_DURATION;
            playbackStartTime = Date.now() - percent * totalDuration;
        }
    }

    onMount(() => {
        isMobile = window.innerWidth <= 768;
        const handleResize = () => {
            isMobile = window.innerWidth <= 768;
        };
        window.addEventListener("resize", handleResize);

        // Fetch featured dishes on mount
        fetchFeaturedDishes();

        return () => window.removeEventListener("resize", handleResize);
    });

    async function fetchFeaturedDishes() {
        isLoadingFeatured = true;
        try {
            const response = await fetch("/api/featured");
            if (response.ok) {
                const data = await response.json();
                featuredDishes = data.dishes || [];
            }
        } catch (err) {
            console.error("Failed to fetch featured dishes:", err);
        } finally {
            isLoadingFeatured = false;
        }
    }

    async function handleFeaturedClick(dish: FeaturedDish) {
        if (isLoadingHistory) return;

        searchQuery = dish.name;
        isLoadingHistory = true;
        isSearching = true;
        error = null;
        dishHistory = null;
        hasSearched = true;
        activeCardIndex = -1;

        try {
            const response = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dish: dish.name }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || "Failed to generate history");
            }

            dishHistory = await response.json();
        } catch (err) {
            error =
                err instanceof Error
                    ? err.message
                    : "An unexpected error occurred";
        } finally {
            isSearching = false;
            isLoadingHistory = false;
        }
    }

    async function handleSearch(e: Event) {
        e.preventDefault();
        if (!searchQuery.trim() || isSearching) return;

        isSearching = true;
        isLoadingHistory = true;
        error = null;
        dishHistory = null;
        hasSearched = true;
        activeCardIndex = -1;

        try {
            const response = await fetch("/api/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ dish: searchQuery.trim() }),
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.message || "Failed to generate history");
            }

            dishHistory = await response.json();
        } catch (err) {
            error =
                err instanceof Error
                    ? err.message
                    : "An unexpected error occurred";
        } finally {
            isSearching = false;
            isLoadingHistory = false;
        }
    }

    function resetView() {
        hasSearched = false;
        dishHistory = null;
        searchQuery = "";
        error = null;
        activeCardIndex = -1;
    }

    // State for temporary disabling observer during manual scrolling
    let isManualScrolling = false;
    let scrollTimeout: number | null;

    // Search Ticker State
    const searchPlaceholderItems = [
        "Pizza",
        "Ulli Vada",
        "Tacos",
        "Ramen",
        "Biryani",
        "Pazhampori",
        "Pasta",
        "any dish",
    ];
    let currentPlaceholderIndex = $state(0);

    // Setup Intersection Observer for scrollytelling
    $effect(() => {
        if (!cardsContainer || !dishHistory) return;

        // Reset state for new results
        activeCardIndex = 0;
        cardsContainer.scrollTop = 0;
        sealVisible = false;

        const observer = new IntersectionObserver(
            (entries) => {
                if (isManualScrolling || isPlaying) return; // Don't update during programmatic scroll or playback
                const intersecting = entries.filter((e) => e.isIntersecting);
                if (intersecting.length > 0) {
                    const indices = intersecting
                        .map((entry) =>
                            cardElements.indexOf(entry.target as HTMLElement),
                        )
                        .filter((i) => i !== -1);
                    if (indices.length > 0) {
                        indices.sort((a, b) => a - b);
                        activeCardIndex = indices[0];
                    }
                }
            },
            {
                root: cardsContainer,
                rootMargin: isMobile
                    ? "0px -40% 0px -40%"
                    : "-40% 0px -40% 0px",
                threshold: 0,
            },
        );

        const sealObserver = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    sealVisible = true;
                }
            },
            {
                root: cardsContainer,
                threshold: 0.1,
            },
        );

        // Wait for next tick to ensure card elements are rendered
        setTimeout(() => {
            cardElements.forEach((el) => {
                if (el) observer.observe(el);
            });
            if (sealElement) {
                sealObserver.observe(sealElement);
            }
        }, 0);

        return () => {
            observer.disconnect();
            sealObserver.disconnect();
        };
    });

    onMount(() => {
        const interval = setInterval(() => {
            currentPlaceholderIndex =
                (currentPlaceholderIndex + 1) % searchPlaceholderItems.length;
        }, 1800);

        return () => {
            clearInterval(interval);
        };
    });

    function cardRef(el: HTMLElement, index: number) {
        cardElements[index] = el;
        return {
            destroy() {
                // Clean up if needed
            },
        };
    }

    function scrollToCard(index: number) {
        // Disable observer updates locally
        isManualScrolling = true;
        clearTimeout(scrollTimeout ?? undefined);

        // Set the active card immediately
        activeCardIndex = index;

        const cardEl = cardElements[index];
        if (cardEl) {
            cardEl.scrollIntoView({
                behavior: "smooth",
                block: "center",
            });
        }

        // Re-enable observer after scroll finishes (approx 800ms)
        // Note: We do NOT pause the animation - it continues while scrolling
        scrollTimeout = setTimeout(() => {
            isManualScrolling = false;
        }, 800);
    }

    function handleMarkerClick(index: number) {
        scrollToCard(index);
    }

    function handleCardClick(index: number) {
        scrollToCard(index);
    }
</script>

<svelte:head>
    <title>Forklore - Discover the History of Your Favorite Dishes</title>
    <meta
        name="description"
        content="An AI-powered interactive map that traces the fascinating culinary history of dishes across the globe. Explore the origins and evolution of food."
    />
</svelte:head>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="app-container">
    <!-- Full-screen Map (always visible - globe in discovery, history in searched) -->
    <div class="map-container" class:landing={!hasSearched}>
        <Map
            steps={dishHistory?.steps || []}
            activeIndex={activeCardIndex}
            onMarkerClick={handleMarkerClick}
            {featuredDishes}
            mode={mapMode}
            onFeaturedClick={handleFeaturedClick}
            isLoading={isLoadingHistory}
        />
    </div>

    <!-- Left Panel Gradient (always visible now) -->
    <div class="left-panel-gradient visible"></div>

    <!-- Top Right Gradient (behind logo - always visible) -->
    <div class="corner-gradient visible"></div>

    <!-- UI Overlay (always visible container for interactions) -->
    <div class="ui-overlay">
        <!-- Logo (persist and move) -->
        <!-- Logo (always in corner) -->
        <button
            class="logo-button corner-logo"
            onclick={resetView}
            aria-label="Return to landing page"
        >
            <img
                src="/logo-horizontal.svg"
                alt="Forklore"
                class="landing-logo"
            />
        </button>

        <!-- Search Container (always in corner position) -->
        <div class="search-container searched">
            <form onsubmit={handleSearch} class="search-form">
                <div
                    class="search-wrapper"
                    class:shimmering={!hasSearched && !searchQuery.trim()}
                >
                    {#if hasSearched}
                        <!-- Back arrow button in searched state -->
                        <button
                            type="button"
                            class="back-button"
                            onclick={resetView}
                            aria-label="Return to discovery"
                        >
                            <Icon
                                icon="material-symbols:arrow-back-rounded"
                                width="24"
                                height="24"
                            />
                        </button>
                    {:else}
                        <Icon
                            icon="material-symbols:search-rounded"
                            class="search-icon"
                            color="white"
                            width="24"
                            height="24"
                        />
                    {/if}

                    <!-- Search Ticker Overlay (only in discovery mode) -->
                    {#if !searchQuery && !isSearching && !hasSearched}
                        <div class="search-ticker">
                            <span class="ticker-static">Search for </span>
                            <div class="ticker-content">
                                {#key currentPlaceholderIndex}
                                    <span
                                        class="ticker-item"
                                        in:fly={{
                                            y: 20,
                                            duration: 300,
                                            delay: 100,
                                        }}
                                        out:fly={{ y: -20, duration: 300 }}
                                    >
                                        {searchPlaceholderItems[
                                            currentPlaceholderIndex
                                        ]}
                                    </span>
                                {/key}
                            </div>
                        </div>
                    {/if}

                    <Input
                        type="text"
                        bind:value={searchQuery}
                        class="search-input"
                        disabled={isSearching}
                    />

                    <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        class="search-button"
                        disabled={isSearching || !searchQuery.trim()}
                    >
                        {#if isSearching}
                            <div class="animate-spin">
                                <Icon
                                    icon="material-symbols:progress-activity"
                                    width="32"
                                    height="32"
                                />
                            </div>
                        {:else}
                            <Icon
                                icon="material-symbols:arrow-forward-rounded"
                                width="32"
                                height="32"
                            />
                        {/if}
                    </Button>
                </div>
            </form>
        </div>

        <!-- Cards Panel - shows Featured Dishes (discovery) or History Cards (searched) -->
        <div class="cards-panel-wrapper visible" class:discovery={!hasSearched}>
            {#if !hasSearched}
                <!-- Featured Dishes (Discovery Mode) -->
                <div class="cards-container">
                    <!-- Intro Section -->
                    <div class="intro-section mt-4">
                        <h2 class="intro-title">Start your time travel</h2>
                        <div class="intro-card">
                            <div class="intro-item">
                                <span class="intro-emoji">🔍️</span>
                                <span class="intro-text"
                                    >Pick a dish you love</span
                                >
                            </div>
                            <div class="intro-item">
                                <span class="intro-emoji">✨</span>
                                <span class="intro-text"
                                    >Let AI research its history instantly</span
                                >
                            </div>
                            <div class="intro-item">
                                <span class="intro-emoji">🗺️</span>
                                <span class="intro-text"
                                    >Trace the path across the globe</span
                                >
                            </div>
                        </div>
                    </div>

                    <!-- Featured Title -->
                    <h2 class="intro-title">Explore Popular Dishes</h2>

                    <!-- Featured Cards -->
                    <div class="featured-cards">
                        {#if isLoadingFeatured}
                            {#each Array(6) as _, i}
                                <div
                                    class="featured-card-skeleton"
                                    style="--delay: {i * 100}ms"
                                >
                                    <Skeleton class="h-10 w-10 rounded-lg" />
                                    <div class="skeleton-text">
                                        <Skeleton class="h-4 w-24" />
                                        <Skeleton class="h-3 w-16" />
                                    </div>
                                </div>
                            {/each}
                        {:else}
                            {#each featuredDishes as dish, i}
                                <FeaturedDishCard
                                    {dish}
                                    isLoading={isLoadingHistory}
                                    onclick={() => handleFeaturedClick(dish)}
                                />
                            {/each}
                        {/if}
                    </div>
                </div>
            {:else}
                <!-- History Cards (Searched State) -->
                {#if isMobile}
                    {#if dishHistory}
                        <div class="mobile-dish-header" in:fade>
                            <h2 class="mobile-dish-title">
                                <span class="mobile-dish-emoji"
                                    >{dishHistory.emoji}</span
                                >
                                <span class="mobile-dish-text"
                                    >{dishHistory.title}</span
                                >
                            </h2>
                        </div>
                    {:else if isSearching}
                        <div
                            class="mobile-dish-header skeleton-entry pb-4"
                            style="--delay: 0ms; gap: 0.75rem;"
                        >
                            <Skeleton class="h-8 w-8 rounded-lg" />
                            <Skeleton class="h-8 w-48" />
                        </div>
                    {/if}
                {/if}

                <div class="cards-panel" bind:this={cardsContainer}>
                    {#if isSearching}
                        {#if !isMobile}
                            <div
                                class="dish-header-section skeleton-entry"
                                style="--delay: 0ms"
                            >
                                <Skeleton class="h-8 w-11/12 mb-2" />
                                <Skeleton class="h-8 w-2/3" />
                            </div>

                            <div
                                class="stats-cards skeleton-entry"
                                style="--delay: 100ms"
                            >
                                <Skeleton class="h-20 flex-1 rounded-xl" />
                                <Skeleton class="h-20 flex-1 rounded-xl" />
                                <Skeleton class="h-20 flex-1 rounded-xl" />
                            </div>
                        {/if}

                        <div class="timeline-container skeleton-timeline">
                            {#each Array(2) as _, i}
                                <div
                                    class="skeleton-entry timeline-item"
                                    style="--delay: {(i + 1) * 150 + 200}ms"
                                >
                                    <div class="timeline-marker-wrapper">
                                        <div class="timeline-marker">
                                            <div class="marker-inner"></div>
                                        </div>
                                    </div>

                                    <div class="timeline-content">
                                        <Skeleton class="h-3 w-12 mb-2" />
                                        <Skeleton class="h-5 w-40 mb-3" />
                                        <Skeleton class="h-3 w-56" />
                                    </div>
                                </div>
                            {/each}
                        </div>
                    {:else if error}
                        <!-- Error State -->
                        <Card.Root class="glass-card error-card">
                            <Card.Header>
                                <Card.Title class="text-red-400"
                                    >Error</Card.Title
                                >
                            </Card.Header>
                            <Card.Content>
                                <p class="text-red-300">{error}</p>
                                <Button
                                    variant="outline"
                                    class="mt-4"
                                    onclick={resetView}
                                >
                                    Try Again
                                </Button>
                            </Card.Content>
                        </Card.Root>
                    {:else if dishHistory}
                        <!-- Large Title Section (Desktop only) -->
                        {#if !isMobile}
                            <div class="dish-header-section">
                                <h1 class="dish-main-title">
                                    {dishHistory.title}
                                </h1>
                            </div>

                            <!-- Stats Cards -->
                            <div class="stats-cards">
                                <div class="stat-card">
                                    <span class="stat-icon">🏛️</span>
                                    <span class="stat-value"
                                        >{dishHistory.stats.yearsOld}</span
                                    >
                                    <span class="stat-label">YEARS OLD</span>
                                </div>
                                <div class="stat-card">
                                    <span class="stat-icon">🍽️</span>
                                    <span class="stat-value"
                                        >{dishHistory.stats
                                            .servingsPerYear}</span
                                    >
                                    <span class="stat-label">SERVINGS/YEAR</span
                                    >
                                </div>
                                <div class="stat-card">
                                    <span class="stat-icon">🌎</span>
                                    <span class="stat-value"
                                        >{dishHistory.stats.globalReach}</span
                                    >
                                    <span class="stat-label">GLOBAL REACH</span>
                                </div>
                            </div>
                        {/if}

                        <!-- History Steps - Timeline Format -->
                        <div
                            class="timeline-container"
                            class:playing={isPlaying}
                        >
                            {#each dishHistory.steps as step, index}
                                <div
                                    class="timeline-item"
                                    class:active={activeCardIndex === index}
                                    class:playing={isPlaying &&
                                        activeCardIndex === index}
                                    use:cardRef={index}
                                    onclick={() => handleCardClick(index)}
                                    onkeydown={(e) =>
                                        e.key === "Enter" &&
                                        handleCardClick(index)}
                                    role="button"
                                    tabindex="0"
                                >
                                    <div class="timeline-marker-wrapper">
                                        <div
                                            class="timeline-marker"
                                            class:playing={isPlaying &&
                                                activeCardIndex === index}
                                        >
                                            <div class="marker-inner"></div>
                                        </div>
                                    </div>

                                    <div class="timeline-content">
                                        <span class="timeline-year"
                                            >{step.year}</span
                                        >
                                        <h4 class="timeline-title">
                                            {step.title}
                                        </h4>
                                        <p class="timeline-description">
                                            {step.description}
                                        </p>
                                    </div>
                                </div>
                            {/each}
                        </div>

                        <!-- End Card -->
                        <div class="end-card" bind:this={sealElement}>
                            <div class="seal-container">
                                <div
                                    class="seal-rotate-wrapper"
                                    class:stamped={sealVisible}
                                >
                                    <img
                                        src="/seal.png"
                                        alt="Official Forklore Seal"
                                        class="seal-image"
                                        class:stamped={sealVisible}
                                    />
                                </div>
                            </div>
                            <Button variant="outline" onclick={resetView}>
                                Explore Another Dish
                            </Button>
                        </div>
                    {/if}
                </div>

                {#if dishHistory}
                    <div class="cards-fade-bottom"></div>
                {/if}
            {/if}
        </div>
    </div>

    <!-- Playback Controls (only in searched state) -->
    {#if hasSearched}
        <div class="playback-controls">
            {#if dishHistory}
                <!-- Mobile Progress Bar (reserves space always, shows content after play) -->
                {#if isMobile}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <!-- svelte-ignore a11y_no_static_element_interactions -->
                    <div
                        class="playback-progress-bar"
                        onclick={handleProgressClick}
                    >
                        {#if wasPlaying}
                            <div class="progress-track">
                                <div
                                    class="progress-filled"
                                    style="width: {progressPercent}%"
                                ></div>
                            </div>
                            <div
                                class="progress-indicator"
                                style="left: clamp(8px, {progressPercent}%, calc(100% - 8px))"
                            ></div>
                        {/if}
                    </div>
                {/if}

                <div class="playback-buttons">
                    <button
                        class="playback-btn"
                        aria-label="Reset"
                        onclick={handleReset}
                    >
                        <Icon
                            icon="material-symbols:restart-alt-rounded"
                            width="24"
                            height="24"
                        />
                    </button>
                    <button
                        class="playback-btn play-btn"
                        aria-label={isPlaying ? "Pause" : "Play"}
                        onclick={() =>
                            isPlaying ? handlePause() : handlePlay()}
                    >
                        {#if isPlaying}
                            <Icon
                                icon="material-symbols:pause-rounded"
                                width="32"
                                height="32"
                            />
                        {:else}
                            <Icon
                                icon="material-symbols:play-arrow-rounded"
                                width="32"
                                height="32"
                            />
                        {/if}
                    </button>
                    <button
                        class="playback-btn"
                        aria-label="Stop"
                        onclick={handleStop}
                    >
                        <Icon
                            icon="material-symbols:stop-rounded"
                            width="24"
                            height="24"
                        />
                    </button>
                </div>
            {:else if isSearching}
                <div class="playback-buttons">
                    <Skeleton class="h-[40px] w-[40px] rounded-full" />
                    <Skeleton class="h-[48px] w-[48px] rounded-full" />
                    <Skeleton class="h-[40px] w-[40px] rounded-full" />
                </div>
            {/if}
        </div>
    {/if}
</div>

<style>
    :global(html) {
        height: 100%;
    }

    :global(body) {
        height: 100%;
        margin: 0;
        overflow: hidden;
    }

    .app-container {
        position: relative;
        width: 100vw;
        height: 100vh;
        height: 100dvh;
        overflow: hidden;
        background-color: #020202;
    }

    .map-container {
        position: absolute;
        inset: 0;
        z-index: 2;
        opacity: 0;
        animation: fadeInMap 0.8s ease-out forwards;
    }

    @keyframes fadeInMap {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    .ui-overlay {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 10;
    }

    .left-panel-gradient {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 5; /* Behind UI overlay but above map/landing bg */
        background: linear-gradient(
            90deg,
            rgba(0, 0, 0, 0.8) 0%,
            rgba(0, 0, 0, 0.8) 30%,
            transparent 50%
        );
        opacity: 0;
        transition: opacity 1s ease;
    }

    .left-panel-gradient.visible {
        opacity: 1;
    }

    .corner-gradient {
        position: absolute;
        inset: 0;
        pointer-events: none;
        z-index: 5;
        background: radial-gradient(
            circle at 100% 0%,
            rgba(0, 0, 0, 0.9) 0%,
            rgba(0, 0, 0, 0.5) 15%,
            transparent 40%
        );
        opacity: 0;
        transition: opacity 1s ease;
    }

    .corner-gradient.visible {
        opacity: 1;
    }

    /* Search Container */
    .search-container {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        width: 100%;
        max-width: 600px;
        padding: 0;
        pointer-events: auto;
        transition: all 0.3s ease-out;
    }

    .search-container.searched {
        top: 1.5rem;
        left: 1.5rem;
        transform: none;
        max-width: 360px;
    }

    .search-container.searched .search-wrapper {
        padding: 0.5rem 0.75rem 0.5rem 1.5rem;
    }

    .search-container.searched :global(.search-input) {
        font-size: 1rem;
        padding: 0.5rem 0.5rem 0.5rem 1rem;
    }

    .search-container.searched :global(.search-button :global(svg)) {
        height: 1.25rem;
        width: 1.25rem;
    }

    .search-container.searched :global(.search-ticker) {
        font-size: 1rem;
    }

    .search-form {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }

    .intro-section {
        margin-bottom: 1.5rem;
    }

    .intro-title {
        color: white;
        font-size: 1.25rem;
        font-weight: 500;
        margin: 0 0 1rem 0;
    }

    .intro-card {
        background:
            linear-gradient(rgba(30, 30, 30, 1), rgba(30, 30, 30, 1))
                padding-box,
            linear-gradient(
                    180deg,
                    rgba(255, 255, 255, 0.3) 0%,
                    rgba(255, 255, 255, 0.1) 100%
                )
                border-box;
        border: 1.4px solid transparent;
        border-radius: 16px;
        padding: 1rem;
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
    }

    .intro-item {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .intro-emoji {
        font-size: 1.5rem;
        width: 2rem;
        text-align: center;
    }

    .intro-text {
        color: rgba(255, 255, 255, 0.8);
        font-size: 0.95rem;
        line-height: 1.4;
    }

    .featured-card-skeleton {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.35rem; /* Match real card gap */
        padding: 0.5rem 1rem; /* Match real card padding */
        background:
            linear-gradient(rgba(40, 40, 40, 1), rgba(40, 40, 40, 1))
                padding-box,
            linear-gradient(
                    180deg,
                    rgba(255, 255, 255, 0.3) 0%,
                    rgba(255, 255, 255, 0.2) 50%,
                    rgba(255, 255, 255, 0.2) 100%
                )
                border-box;
        border: 1.4px solid transparent;
        border-radius: 16px;
        animation: skeleton-pulse 1.5s ease-in-out infinite;
        animation-delay: var(--delay);
        height: 150px;
    }

    .skeleton-text {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
    }

    @keyframes skeleton-pulse {
        0%,
        100% {
            opacity: 0.4;
        }
        50% {
            opacity: 0.7;
        }
    }

    /* Search Container Landing Overrides */
    .search-container:not(.searched) .search-wrapper {
        background: rgba(255, 255, 255, 0.95);
        border: 1px solid white;
        padding: 0.5rem 0.5rem 0.5rem 1.5rem; /* Less padding right for button */
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
    }

    .search-container:not(.searched) :global(.search-input) {
        color: black !important;
    }

    .search-container:not(.searched) .search-ticker {
        color: rgba(0, 0, 0, 0.5);
    }

    /* Landing Search Focus State */
    .search-container:not(.searched) .search-wrapper:focus-within {
        border-color: rgba(255, 255, 255, 1);
        border-width: 4px;
        box-shadow: 0 8px 48px rgba(0, 0, 0, 1);
    }

    .search-container:not(.searched) .ticker-item {
        color: rgba(0, 0, 0, 0.5);
    }

    /* Landing Search Button */
    .search-container:not(.searched) :global(.search-button) {
        background: #ee3e55 !important;
        width: 48px !important;
        height: 48px !important;
        border-radius: 50% !important;
        color: white !important;
    }

    .search-container:not(.searched) :global(.search-button:hover) {
        background: #ff5f73 !important;
    }

    .search-wrapper {
        position: relative;
        width: 100%;
        display: flex;
        align-items: center;
        background: rgba(0, 0, 0, 0.7);
        backdrop-filter: blur(16px);
        border: 1.6px solid rgba(255, 255, 255, 0.2);
        border-radius: 9999px;
        padding: 1rem 1rem 1rem 1.5rem;
        box-shadow: 0 8px 64px rgba(0, 0, 0, 0.9);
        transition: all 0.3s ease;
        overflow: hidden; /* For the shimmer effect */
    }

    /* Remove shimmer on landing since it's now white bg - or make it subtle dark? 
       For now, let's effectively hide the shimmer or make it subtle on white */
    .search-container:not(.searched) .search-wrapper.shimmering::before {
        display: none;
    }

    .search-wrapper.shimmering::before {
        content: "";
        position: absolute;
        top: 0;
        left: -150%;
        width: 100%;
        height: 100%;
        background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.1),
            transparent
        );
        transform: skewX(-20deg);
        animation: shimmer 3s infinite linear;
        pointer-events: none;
    }

    @keyframes shimmer {
        0% {
            left: -150%;
        }
        50%,
        100% {
            left: 150%;
        }
    }

    .search-wrapper:focus-within {
        box-shadow: 0 0px 80px rgba(0, 0, 0, 1);
        border: 1.6px solid rgba(255, 255, 255, 0.8);
    }

    .back-button {
        background: none;
        border: none;
        color: white;
        cursor: pointer;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: opacity 0.2s ease;
    }

    .back-button:hover {
        opacity: 0.7;
    }

    .search-ticker {
        position: absolute;
        left: 4rem; /* Adjusted to align with cursor: Icon + Padding + Input Padding */
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        align-items: center;
        gap: 0.3rem;
        pointer-events: none;
        color: rgba(255, 255, 255, 0.5);
        font-size: 1.25rem;
        /* z-index: 0; */
    }

    .ticker-static {
        white-space: pre;
    }

    .ticker-content {
        position: relative;
        height: 1.5em; /* Match line-height roughly */
        width: 120px; /* arbitrary width to contain word */
        overflow: hidden;
        display: flex;
        align-items: center;
    }

    .ticker-item {
        position: absolute;
        left: 0;
        white-space: nowrap;
    }

    :global(.search-input) {
        flex: 1;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
        color: white !important;
        padding: 1rem !important;
        font-size: 1rem !important;
    }

    :global(.search-input::placeholder) {
        color: rgba(255, 255, 255, 0.5) !important;
    }

    :global(.search-button) {
        background: white !important;
        color: black !important;
        border-radius: 9999px !important;
        width: 40px !important;
        height: 40px !important;
        padding: 0 !important;
    }

    :global(.search-button :global(svg)) {
        height: 2rem !important;
        width: 2rem !important;
    }

    :global(.search-button:hover) {
        background: rgba(255, 255, 255, 0.8) !important;
    }

    .logo-button {
        position: absolute;
        top: 25%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: none;
        border: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        z-index: 20;
        pointer-events: auto;
        transition: all 0.3s ease-out;
        filter: drop-shadow(0px 4px 16px rgba(0, 0, 0, 1));
    }

    .logo-button.corner-logo {
        top: 2rem;
        left: auto;
        right: 2rem;
        transform: none;
    }

    .landing-logo {
        height: 64px;
        width: auto;
    }

    .corner-logo .landing-logo {
        height: 32px; /* Slightly smaller in the corner */
    }

    /* Cards Panel Wrapper */
    .cards-panel-wrapper {
        position: absolute;
        left: 1.5rem;
        top: 6rem;
        bottom: 2rem;
        max-width: 360px; /* Increased from 400px to allow more room for 3 columns */
        width: 100%;
        pointer-events: none;
        z-index: 20;
    }

    .featured-cards {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 0.5rem;
        width: 100%;
        /* Removed extra padding-right to align with other cards */
    }
    .cards-container {
        position: absolute;
        inset: 0;
        overflow-y: auto;
        pointer-events: auto;
        scrollbar-width: none;
        padding: 0 0rem 2rem 0; /* Added slight right padding to prevent border crop */
    }

    .cards-container::-webkit-scrollbar {
        display: none;
    }

    .cards-fade-bottom {
        position: absolute;
        left: 0;
        right: 0;
        height: 60px;
        pointer-events: none;
        z-index: 10;
        bottom: 0;
        background: linear-gradient(
            to top,
            rgba(0, 0, 0, 0.8) 0%,
            transparent 100%
        );
    }

    /* Playback Controls */
    .playback-controls {
        position: fixed;
        bottom: 2rem;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.5rem 0.75rem;
        background:
            linear-gradient(rgba(30, 30, 30, 0.8), rgba(30, 30, 30, 0.8))
                padding-box,
            linear-gradient(
                    180deg,
                    rgba(255, 255, 255, 0.3) 0%,
                    rgba(255, 255, 255, 0.1) 100%
                )
                border-box;
        border: 1.4px solid transparent;
        backdrop-filter: blur(12px);
        border-radius: 9999px;
        z-index: 100;
        box-shadow: 0px 16px 32px rgba(0, 0, 0, 0.7);
    }

    .playback-buttons {
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0.75rem;
    }

    .playback-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 40px;
        background: transparent;
        border: none;
        color: white;
        cursor: pointer;
        border-radius: 50%;
        transition: all 0.2s ease;
    }

    .playback-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .playback-btn.play-btn {
        width: 48px;
        height: 48px;
        background: #ff8c00;
        color: black;
        transition: all 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    .playback-btn.play-btn:hover {
        background: #ffa333;
        transform: scale(1.08);
        box-shadow: 0 4px 16px rgba(255, 140, 0, 0.4);
    }

    .playback-btn.play-btn:active {
        transform: scale(0.95);
    }

    /* Cards Panel */
    .cards-panel {
        position: absolute;
        inset: 0;
        overflow-y: auto;
        pointer-events: auto;
        padding-top: 1rem;
        padding-bottom: 1rem;
        scrollbar-width: thin;
        scrollbar-color: rgba(255, 140, 0, 0) transparent;
    }

    .cards-panel::-webkit-scrollbar {
        width: 6px;
    }

    .cards-panel::-webkit-scrollbar-track {
        background: transparent;
    }

    .cards-panel::-webkit-scrollbar-thumb {
        background: rgba(255, 140, 0, 0.3);
        border-radius: 3px;
    }

    :global(.glass-card) {
        background: rgba(41, 41, 41, 0.5) !important;
        backdrop-filter: blur(16px) !important;
        border: 1.6px solid rgba(255, 255, 255, 0.1) !important;
        color: white !important;
    }

    /* New styles for searched state */
    .dish-header-section {
        margin-bottom: 1.5rem;
    }

    .dish-main-title {
        font-size: 1.5rem;
        font-weight: 700;
        color: white;
        line-height: 1.3;
        margin: 0;
    }

    .stats-cards {
        display: flex;
        gap: 0.75rem;
        margin-bottom: 1.5rem;
    }

    .stat-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        padding: 0.75rem 1rem;
        min-height: 105px;
        background:
            linear-gradient(rgba(30, 30, 30, 0.8), rgba(30, 30, 30, 0.8))
                padding-box,
            linear-gradient(
                    180deg,
                    rgba(255, 255, 255, 0.3) 0%,
                    rgba(255, 255, 255, 0.1) 100%
                )
                border-box;
        border: 1.4px solid transparent;
        border-radius: 12px;
        flex: 1;
        text-align: center;
    }

    .stat-icon {
        font-size: 1.5rem;
        line-height: 1;
    }

    .stat-value {
        font-size: 1.1rem;
        font-weight: 700;
        color: white;
    }

    .stat-label {
        font-size: 0.6rem;
        color: rgba(255, 255, 255, 0.5);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    /* Timeline Styles */
    .timeline-container {
        position: relative;
    }

    .timeline-item::after {
        content: "";
        position: absolute;
        left: 20px; /* Perfectly centered with 42px wrapper */
        top: 2rem;
        bottom: -2.7rem; /* Extends to next item's marker */
        width: 2px;
        background: rgba(255, 255, 255, 0.2);
        z-index: 0;
    }

    .timeline-item.active::after {
        background: linear-gradient(
            to bottom,
            rgba(255, 140, 0, 0.6) 0%,
            rgba(255, 255, 255, 0.1) 100%
        );
    }

    /* Traveling indicator during playback */
    .timeline-item.playing::before {
        content: "";
        position: absolute;
        left: 16px; /* Center with the line (20px - half of 8px dot) */
        top: 2rem;
        width: 10px;
        height: 10px;
        background: #ff8c00;
        border-radius: 50%;
        box-shadow:
            0 0 10px #ff8c00,
            0 0 20px #ff8c00,
            0 0 30px rgba(255, 140, 0, 0.5);
        z-index: 5;
        animation: travel-down 4s linear infinite;
    }

    @keyframes travel-down {
        0% {
            top: 2rem;
            opacity: 1;
        }
        90% {
            opacity: 1;
        }
        100% {
            top: calc(100% + 2.7rem - 10px);
            opacity: 0;
        }
    }

    .timeline-item:last-child::after {
        display: none;
    }

    .timeline-item:last-child.playing::before {
        display: none;
    }

    .timeline-item {
        display: flex;
        gap: 1rem;
        margin-bottom: 2rem;
        position: relative;
        z-index: 1;
        cursor: pointer;
        opacity: 0.5;
        transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        padding: 0.5rem 0;
    }

    .timeline-item.active {
        opacity: 1;
    }

    .timeline-marker-wrapper {
        width: 42px; /* Increased to accommodate 20px markers */
        flex-shrink: 0;
        display: flex;
        justify-content: center;
        padding-top: 4px;
    }

    .timeline-marker {
        width: 16px; /* Slightly smaller inactive rings as per mockup */
        height: 16px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.25);
        display: flex;
        align-items: center;
        justify-content: center;
        background: transparent;
        transition: all 0.3s ease;
        position: relative;
        z-index: 2;
    }

    .timeline-item.active .timeline-marker {
        border-color: white;
        background: #ff8c00;
        width: 20px;
        height: 20px;
        box-shadow: 0 0 16px 1px rgba(255, 140, 0, 0.9);
    }

    /* Disable marker transitions during playback for instant switching */
    .timeline-container.playing .timeline-marker {
        transition: none;
    }

    .marker-inner {
        display: none;
    }

    .timeline-content {
        flex: 1;
    }

    .timeline-year {
        color: #ff8c00;
        font-weight: 600;
        font-size: 0.75rem;
        letter-spacing: 0.05em;
        /* text-transform: uppercase; */
    }

    .timeline-title {
        color: white;
        font-size: 1rem;
        font-weight: 600;
        margin: 0.25rem 0 0.5rem;
    }

    .timeline-description {
        color: rgba(255, 255, 255, 0.7);
        font-size: 0.9rem;
        line-height: 1.5;
        margin: 0;
    }

    /* Skeleton Loading - Timeline Format */
    .skeleton-entry {
        opacity: 0;
        animation: fade-in 0.5s ease forwards;
        animation-delay: var(--delay);
        transform: none !important; /* Force no slide */
    }

    .skeleton-timeline .timeline-item {
        opacity: 0.3;
        cursor: default;
    }

    .skeleton-timeline {
        margin-top: 2.8rem;
    }

    .skeleton-timeline .timeline-item {
        opacity: 1; /* Full opacity for skeleton entries */
    }

    .skeleton-timeline .timeline-marker {
        width: 20px;
        height: 20px;
        border-color: rgba(255, 255, 255, 0.4);
    }

    @keyframes fade-in {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    .end-card {
        text-align: center;
        padding: 3rem 1rem 5rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }

    .seal-container {
        margin-bottom: 1.5rem;
    }

    .seal-rotate-wrapper.stamped {
        display: flex;
        align-items: center;
        justify-content: center;
        animation: seal-ambient-rotate 60s linear infinite;
    }

    .seal-image {
        width: 120px;
        height: auto;
        opacity: 0;
        transform: scale(1.1);
        filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.5));
        transition: all 0.8s cubic-bezier(0.2, 0.8, 0.2, 1);
    }

    .seal-image.stamped {
        opacity: 1;
        transform: scale(1);
    }

    @keyframes seal-ambient-rotate {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    :global(.error-card) {
        border-color: rgba(239, 68, 68, 0.3) !important;
    }

    @keyframes spin {
        from {
            transform: rotate(0deg);
        }
        to {
            transform: rotate(360deg);
        }
    }

    .animate-spin {
        animation: spin 1s linear infinite;
    }

    /* Responsive */
    @media (max-width: 768px) {
        .logo-button {
            top: 20%;
        }
        .logo-button.corner-logo {
            top: 1.5rem;
            left: 50%;
            right: auto;
            transform: translateX(-50%);
        }
        .landing-logo {
            height: 40px;
        }
        .corner-logo .landing-logo {
            height: 26px;
        }

        .search-container {
            top: 42%;
            padding: 0 1rem;
        }
        .search-container.searched {
            top: 4rem; /* Positioned below the centered corner logo */
            left: 1rem;
            right: 1rem;
            width: auto;
            max-width: none;
            transform: none;
            padding: 0;
        }
        .search-container.searched .search-wrapper {
            padding: 0.4rem 0.6rem 0.4rem 1rem;
        }

        .corner-gradient.visible {
            background: linear-gradient(
                180deg,
                rgba(0, 0, 0, 0.7) 10%,
                rgba(0, 0, 0, 0) 20%
            );
        }

        :global(.feature-icon-wrapper img) {
            width: 32px !important;
        }

        .search-container:not(.searched) .search-wrapper {
            padding: 0.5rem 0.5rem 0.5rem 1.2rem;
        }
        .search-ticker {
            font-size: 1.2rem !important;
            left: 3.25rem;
        }
        :global(.search-input) {
            font-size: 1.2rem !important;
            padding: 0.7rem !important;
        }
        .search-container:not(.searched) :global(.search-button) {
            width: 48px !important;
            height: 48px !important;
        }
        :global(.search-button :global(svg)) {
            height: 1.5rem !important;
            width: 1.5rem !important;
        }

        .cards-panel-wrapper {
            left: 0;
            right: 0;
            top: auto;
            bottom: 0;
            height: auto; /* Changed to auto for dynamic height */
            max-height: 70vh; /* Prevent overflowing the screen */
            max-width: none;
            width: 100%;
            display: flex;
            flex-direction: column;
            pointer-events: auto;
            z-index: 10;
        }

        .mobile-dish-header {
            padding: 1rem 1.5rem 1.5rem 1.5rem;
            text-align: left;
            display: flex;
            align-items: center;
            justify-content: flex-start;
            background: linear-gradient(
                to top,
                rgba(0, 0, 0, 0.8),
                transparent
            );
        }

        .mobile-dish-title {
            color: white;
            font-size: 1.2rem;
            font-weight: 600;
            margin: 0;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
            text-align: left;
            display: flex;
            align-items: center;
            gap: 0.5rem;
            line-height: 1.3;
        }

        .mobile-dish-emoji {
            font-size: 2rem;
            flex-shrink: 0;
        }

        .mobile-dish-text {
            flex: 1;
            padding-top: 0.1rem;
        }

        .cards-fade-bottom {
            display: none;
        }

        .cards-panel {
            position: relative;
            inset: auto;
            display: flex;
            flex-direction: row;
            overflow-x: auto;
            overflow-y: hidden;
            scroll-snap-type: x mandatory;
            padding: 0rem 1.5rem calc(6rem + env(safe-area-inset-bottom)); /* Respect safe area and leave space for controls */
            gap: 1.25rem;
            flex: 1;
            align-items: stretch; /* Stretch items vertically to match tallest */
            scrollbar-width: none;
            background: linear-gradient(
                to bottom,
                rgba(0, 0, 0, 0.8),
                rgba(0, 0, 0, 0.95)
            );
        }

        .timeline-container {
            display: flex;
            flex-direction: row;
            gap: 1rem;
            width: fit-content;
            height: 100%;
        }

        .timeline-marker-wrapper {
            display: none;
        }

        .timeline-marker {
            display: none;
        }

        .timeline-item.active .timeline-marker {
            display: none;
        }

        .timeline-item::after {
            display: none;
        }

        .timeline-item.active::after {
            display: none;
        }

        .timeline-item:last-child::after {
            display: none;
        }

        .timeline-item.playing::before {
            display: none;
        }

        .cards-panel::-webkit-scrollbar {
            display: none;
        }

        .timeline-item,
        .end-card {
            flex-shrink: 0;
            width: 80vw; /* Slightly wider cards for better reading */
            height: auto; /* Natural height */
            scroll-snap-align: center;
            scroll-snap-stop: always;
            margin-bottom: 0 !important;
            display: flex;
            flex-direction: column;
            padding: 0;
            gap: 0.5rem;
        }

        .timeline-item :global(.glass-card),
        .end-card :global(.glass-card) {
            height: auto;
            width: 100%;
            display: flex;
            flex-direction: column;
            margin-top: 0.5rem;
        }

        .timeline-content {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .end-card {
            justify-content: center;
            display: none;
        }

        .skeleton-timeline {
            width: fit-content;
            margin-top: 0;
        }

        .skeleton-timeline .skeleton-entry {
            width: 70vw; /* Match real cards */
            flex-shrink: 0;
            height: 100%;
            display: flex;
            flex-direction: column;
        }

        .skeleton-timeline :global(.glass-card) {
            height: 100%;
            width: 100%;
            display: flex;
            flex-direction: column;
            flex: 1;
        }

        /* Gradient adjustment for mobile */
        .left-panel-gradient {
            background: linear-gradient(
                to top,
                rgba(0, 0, 0, 0.6) 0%,
                transparent 40%
            );
        }

        .cards-panel-wrapper.discovery {
            height: auto;
            position: absolute;
            top: auto;
            bottom: 0;
            padding-bottom: calc(1.5rem + env(safe-area-inset-bottom));
            background: linear-gradient(
                to top,
                rgba(0, 0, 0, 0.98) 0%,
                rgba(0, 0, 0, 0.8) 70%,
                transparent 100%
            );
            pointer-events: auto;
        }

        .cards-container {
            position: relative; /* Overriding global absolute inset 0 */
            padding: 0;
            height: auto;
            overflow: visible;
        }

        .discovery .intro-title {
            margin-left: 1.5rem;
            margin-right: 1.5rem;
        }

        .featured-cards {
            display: flex;
            flex-direction: row;
            overflow-x: auto;
            gap: 0.5rem;
            padding: 0 0 0 0.5rem; /* Remove horizontal padding here */
            scrollbar-width: none;
            width: 100%;
            -webkit-overflow-scrolling: touch;
        }

        .featured-cards::before {
            content: "";
            flex: 0 0 0.5rem;
            width: 0.5rem;
        }

        .featured-cards::after {
            content: "";
            flex: 0 0 1.5rem;
            width: 1.5rem;
        }

        .featured-cards::-webkit-scrollbar {
            display: none;
        }

        /* Discovery state mobile optimizations */
        .intro-section {
            display: none;
        }

        .featured-cards :global(.featured-card) {
            flex-shrink: 0;
            width: auto;
            min-width: 140px;
        }

        .featured-cards :global(.featured-card-skeleton) {
            flex-shrink: 0;
            width: 240px;
            flex-direction: row;
            justify-content: flex-start;
            padding: 0.75rem 1rem;
            height: auto;
            min-height: 70px;
            gap: 1rem;
        }

        .featured-cards :global(.featured-card-skeleton .skeleton-text) {
            align-items: flex-start;
            gap: 0.4rem;
        }

        .map-container {
            top: 60px; /* Move map down to clear space for header */
        }

        .map-container.landing {
            top: 150px; /* Push globe down more on landing page */
        }

        .playback-controls {
            bottom: 0;
            left: 0;
            right: 0;
            transform: none;
            z-index: 100;
            flex-direction: column;
            padding: 0 0 calc(0.75rem + env(safe-area-inset-bottom)) 0;
            width: 100%;
            max-width: none;
            border-radius: 0;
            border-left: none;
            border-right: none;
        }

        .playback-buttons {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 0.75rem;
            padding-top: 0.75rem;
        }

        .playback-progress-bar {
            width: 100%;
            height: 8px;
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            cursor: pointer;
            margin: 0;
            padding: 0;
        }

        .progress-track {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 0;
        }

        .progress-filled {
            height: 100%;
            background: #ff8c00;
            border-radius: 0;
        }

        .progress-indicator {
            position: absolute;
            top: 1.5px;
            width: 16px;
            height: 16px;
            background: #ff8c00;
            border-radius: 50%;
            transform: translate(-50%, -50%);
            box-shadow:
                0 0 10px #ff8c00,
                0 0 20px rgba(255, 140, 0, 0.4);
        }
    }

    /* Skeleton Animations */
</style>
