<script lang="ts">
    import { onMount } from "svelte";
    import { fade, fly } from "svelte/transition";
    import Map from "$lib/components/Map.svelte";
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
        steps: Step[];
    }

    // State
    let searchQuery = $state("");
    let isSearching = $state(false);
    let hasSearched = $state(false);
    let dishHistory = $state<DishHistory | null>(null);
    let error = $state<string | null>(null);
    let activeCardIndex = $state(-1);

    // Show map only when we have results
    let showMap = $derived(dishHistory !== null);

    // Card elements for intersection observer
    let cardElements: HTMLElement[] = [];
    let cardsContainer = $state<HTMLElement | null>(null);
    let sealElement = $state<HTMLElement | null>(null);
    let sealVisible = $state(false);
    let isMobile = $state(false);

    onMount(() => {
        isMobile = window.innerWidth <= 768;
        const handleResize = () => {
            isMobile = window.innerWidth <= 768;
        };
        window.addEventListener("resize", handleResize);
        return () => window.removeEventListener("resize", handleResize);
    });

    async function handleSearch(e: Event) {
        e.preventDefault();
        if (!searchQuery.trim() || isSearching) return;

        isSearching = true;
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
                if (isManualScrolling) return;
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

        // Re-enable observer after scroll animation finishes (approx 800ms)
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
    <!-- Landing Background -->
    {#if !showMap}
        <div class="landing-background" out:fade={{ duration: 1000 }}></div>
        <div class="landing-overlay" out:fade={{ duration: 1000 }}></div>
    {/if}

    <!-- Full-screen Map (shown after results) -->
    {#if showMap}
        <div class="map-container" class:visible={showMap}>
            <Map
                steps={dishHistory?.steps || []}
                activeIndex={activeCardIndex}
                onMarkerClick={handleMarkerClick}
            />
        </div>
    {/if}

    <!-- Left Panel Gradient (only shown with map/loading) -->
    <div class="left-panel-gradient" class:visible={hasSearched}></div>

    <!-- Top Right Gradient (behind logo) -->
    <div class="corner-gradient" class:visible={hasSearched}></div>

    <!-- UI Overlay (always visible container for interactions) -->
    <div class="ui-overlay">
        <!-- Logo (persist and move) -->
        <button
            class="logo-button"
            class:corner-logo={hasSearched}
            onclick={resetView}
            aria-label="Return to landing page"
        >
            <img
                src="/logo-horizontal.svg"
                alt="Forklore"
                class="landing-logo"
            />
        </button>

        <!-- Landing Content (Tagline) -->
        {#if !hasSearched}
            <div class="landing-header" out:fade={{ duration: 300 }}>
                <p class="landing-tagline">
                    Discover the origins and evolution of your favorite dishes
                    through time & space
                </p>
            </div>
        {/if}

        <!-- Search Container -->
        <div class="search-container" class:searched={hasSearched}>
            <form onsubmit={handleSearch} class="search-form">
                <div
                    class="search-wrapper"
                    class:shimmering={!hasSearched && !searchQuery.trim()}
                >
                    <Icon
                        icon="material-symbols:search-rounded"
                        class="search-icon"
                        color={hasSearched ? "white" : "black"}
                        width="24"
                        height="24"
                    />
                    <!-- Search Ticker Overlay -->
                    {#if !searchQuery && !isSearching}
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

        <!-- Features (Landing Only) -->
        {#if !hasSearched}
            <div
                class="features-container"
                in:fade={{ delay: 200, duration: 800 }}
                out:fade={{ duration: 300 }}
            >
                <div class="feature-card">
                    <div class="feature-icon-wrapper">
                        <img src="/map-emoji.png" class="w-16" alt="" />
                    </div>
                    <p class="feature-text">Travel through time and taste</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon-wrapper">
                        <img src="/sparkles-emoji.png" class="w-16" alt="" />
                    </div>
                    <p class="feature-text">Uncover hidden stories instantly</p>
                </div>
                <div class="feature-card">
                    <div class="feature-icon-wrapper">
                        <img src="/lollipop-emoji.png" class="w-16" alt="" />
                    </div>
                    <p class="feature-text">Watch the journey come alive</p>
                </div>
            </div>
        {/if}

        <!-- Story Cards Panel -->
        {#if hasSearched}
            <div class="cards-panel-wrapper" class:visible={hasSearched}>
                {#if isMobile}
                    {#if dishHistory}
                        <div class="mobile-dish-header" in:fade>
                            <h2 class="mobile-dish-title">
                                {dishHistory.emoji}
                                {dishHistory.title}
                            </h2>
                        </div>
                    {:else if isSearching}
                        <div
                            class="mobile-dish-header skeleton-entry"
                            style="--delay: 0ms; gap: 0.5rem;"
                        >
                            <Skeleton class="h-8 w-48" />
                        </div>
                    {/if}
                {/if}

                <div class="cards-panel" bind:this={cardsContainer}>
                    {#if isSearching}
                        {#if !isMobile}
                            <div
                                class="title-card skeleton-entry"
                                style="--delay: 0ms"
                            >
                                <Skeleton
                                    class="w-16 h-16 rounded-full mx-auto mb-4"
                                />
                                <Skeleton class="h-8 w-3/4 mx-auto mb-2" />
                                <Skeleton class="h-4 w-1/2 mx-auto" />
                            </div>
                        {/if}

                        <div class="timeline-container skeleton-timeline">
                            <div class="timeline-line"></div>
                            {#each Array(2) as _, i}
                                <div
                                    class="skeleton-entry timeline-item"
                                    style="--delay: {(i + 1) * 150}ms"
                                >
                                    <div class="timeline-marker-wrapper">
                                        <div class="timeline-marker">
                                            <div class="marker-inner"></div>
                                        </div>
                                    </div>

                                    <div class="timeline-content">
                                        <div class="timeline-header">
                                            <Skeleton class="h-4 w-20" />
                                        </div>
                                        <div
                                            class="timeline-card-content glass-card"
                                        >
                                            <Skeleton class="h-4 w-full mb-2" />
                                            <Skeleton class="h-4 w-2/3" />
                                        </div>
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
                        <!-- Title Card (Desktop only - Mobile has its own header below) -->
                        {#if !isMobile}
                            <div class="title-card">
                                <div class="dish-emoji mb-4">
                                    {dishHistory.emoji}
                                </div>
                                <h1 class="dish-title">{dishHistory.title}</h1>
                            </div>
                        {/if}

                        <!-- History Steps - Timeline Format -->
                        <div class="timeline-container">
                            <div class="timeline-line"></div>
                            {#each dishHistory.steps as step, index}
                                <div
                                    class="timeline-item"
                                    class:active={activeCardIndex === index}
                                    use:cardRef={index}
                                    onclick={() => handleCardClick(index)}
                                    onkeydown={(e) =>
                                        e.key === "Enter" &&
                                        handleCardClick(index)}
                                    role="button"
                                    tabindex="0"
                                >
                                    <div class="timeline-marker-wrapper">
                                        <div class="timeline-marker">
                                            <div class="marker-inner"></div>
                                        </div>
                                    </div>

                                    <div class="timeline-content">
                                        <div class="timeline-header">
                                            <span class="timeline-year"
                                                >{step.year}</span
                                            >
                                        </div>
                                        <div
                                            class="timeline-card-content glass-card"
                                        >
                                            <p class="timeline-description">
                                                {step.description}
                                            </p>
                                        </div>
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
            </div>
        {/if}
    </div>
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
    }

    .landing-background {
        position: absolute;
        inset: -30px;
        background-image: url("/home-bg.png");
        background-size: cover;
        background-position: center;
        transition: transform 0.1s ease-out;
        z-index: 0;
    }

    .landing-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(
            180deg,
            rgba(0, 0, 0, 0.6) -50%,
            rgba(0, 0, 0, 0.8) 70%
        );
        z-index: 1;
    }

    .map-container {
        position: absolute;
        inset: 0;
        z-index: 2;
        opacity: 0;
        animation: fadeInMap 0.8s ease-out forwards;
    }

    .map-container.visible {
        opacity: 1;
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
            rgba(0, 0, 0, 0.75) 0%,
            rgba(0, 0, 0, 0.75) 30%,
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
        max-width: 400px;
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

    /* Feature Cards */
    .features-container {
        position: absolute;
        top: 60%;
        left: 50%;
        transform: translate(-50%, 0);
        display: flex;
        gap: 1.5rem;
        z-index: 10;
        width: 100%;
        max-width: 900px;
        justify-content: center;
        flex-wrap: wrap;
    }

    .feature-card {
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(6px);
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 24px;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        gap: 1rem;
        width: 200px;
        transition:
            transform 0.3s ease,
            background 0.3s ease;
    }

    .feature-card:hover {
        transform: translateY(-5px);
        background: rgba(0, 0, 0, 0.7);
        border-color: rgba(255, 255, 255, 0.3);
    }

    /* Icon placeholders */
    .feature-icon-wrapper {
        font-size: 3rem;
        margin-bottom: 0.5rem;
    }

    .feature-text {
        font-size: 0.9375rem;
        line-height: 1.4;
        color: rgba(255, 255, 255, 0.9);
        font-weight: 500;
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

    /* Subsitute border with separate property for shimmering state if needed, or overlay */
    .search-wrapper.shimmering {
        border-color: rgba(255, 255, 255, 0.4);
        position: relative;
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
        font-size: 1.25rem !important;
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

    .landing-header {
        position: absolute;
        top: 35%;
        left: 50%;
        transform: translate(-50%, -50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
        z-index: 12;
        width: 100%;
        padding: 0 1rem;
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

    .landing-tagline {
        color: white;
        font-size: 1.2rem;
        text-align: center;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
        max-width: 600px;
        line-height: 1.5;
    }

    /* Cards Panel Wrapper */
    .cards-panel-wrapper {
        position: absolute;
        left: 1.5rem;
        top: 6rem;
        bottom: 2rem;
        max-width: 400px;
        width: 100%;
        pointer-events: none;
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

    /* Cards Panel */
    .cards-panel {
        position: absolute;
        inset: 0;
        overflow-y: auto;
        pointer-events: auto;
        padding-top: 1rem;
        padding-bottom: 1rem;
        scrollbar-width: thin;
        scrollbar-color: rgba(84, 185, 202, 0) transparent;
    }

    .cards-panel::-webkit-scrollbar {
        width: 6px;
    }

    .cards-panel::-webkit-scrollbar-track {
        background: transparent;
    }

    .cards-panel::-webkit-scrollbar-thumb {
        background: rgba(84, 185, 202, 0.3);
        border-radius: 3px;
    }

    :global(.glass-card) {
        background: rgba(41, 41, 41, 0.5) !important;
        backdrop-filter: blur(16px) !important;
        border: 1.6px solid rgba(255, 255, 255, 0.1) !important;
        color: white !important;
    }

    .title-card {
        text-align: center;
        padding: 1rem;
        margin-bottom: 1rem;
    }

    .dish-emoji {
        font-size: 4rem;
        line-height: 1;
        /* create text shadow */
        text-shadow: 0 4px 24px rgba(0, 0, 0, 0.5);
    }

    .dish-title {
        font-size: 1.75rem;
        font-weight: 700;
        color: white;
        text-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
        margin: 0;
        line-height: 140%;
    }

    .step-card {
        margin-bottom: 1rem;
        opacity: 0.6;
        /* transform: translateX(-10px); */
        /* transition: all 0.4s ease; */
        cursor: pointer;
    }

    .step-card.active {
        opacity: 1;
        /* transform: translateX(0); */
    }

    .step-card.active :global(.glass-card) {
        border-color: rgba(255, 255, 255, 0.3) !important;
        box-shadow: 0 0 20px rgba(84, 185, 202, 0.15);
        border-width: 2px !important;
        background: rgba(41, 41, 41, 1) !important;
    }

    /* Timeline Styles */
    .timeline-container {
        position: relative;
    }

    .timeline-line {
        position: absolute;
        left: 10px;
        top: 1.5rem;
        bottom: 185px;
        width: 1px;
        border-left: 2px dashed rgba(255, 255, 255, 0.15);
        z-index: 0;
    }

    .timeline-item {
        display: flex;
        gap: 1rem;
        margin-bottom: 1.8rem;
        position: relative;
        z-index: 1;
        cursor: pointer;
        opacity: 0.4;
        transition: all 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);
        padding: 0.5rem 0;
        border-radius: 12px;
    }

    .timeline-item.active {
        opacity: 1;
    }

    .timeline-marker-wrapper {
        flex-shrink: 0;
        padding-top: 4px;
    }

    .timeline-marker {
        width: 20px;
        height: 20px;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 1);
        transition: all 0.3s ease;
    }

    .marker-inner {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: transparent;
        transition: all 0.3s ease;
    }

    .timeline-item.active .timeline-marker {
        border-color: #54b9ca;
        box-shadow: 0 0 15px rgba(84, 185, 202, 0.4);
    }

    .timeline-item.active .marker-inner {
        background: #54b9ca;
    }

    .timeline-content {
        flex: 1;
    }

    .timeline-header {
        margin-bottom: 0.75rem;
    }

    .timeline-year {
        color: #54b9ca;
        font-weight: 600;
        font-size: 0.9rem;
        letter-spacing: 0.05em;
        text-transform: uppercase;
    }

    .timeline-card-content {
        position: relative;
        padding: 1rem 1.25rem;
        border-radius: 16px;
        transition: all 0.3s ease;
        margin-top: 1.2rem;
        overflow-y: auto;
        scrollbar-width: none;
    }

    .timeline-card-content::-webkit-scrollbar {
        display: none;
    }

    .timeline-card-content::before {
        content: "";
        position: absolute;
        left: 28px;
        top: -7px;
        width: 12px;
        height: 12px;
        background: rgb(21 21 21);
        border-top: 1.6px solid rgba(255, 255, 255, 0.1);
        border-left: 1.6px solid rgba(255, 255, 255, 0.1);
        transform: rotate(45deg);
        transition: all 0.3s ease;
    }

    .timeline-item.active .timeline-card-content {
        background: rgb(34 34 34) !important;
        border-color: rgba(255, 255, 255, 0) !important;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
    }

    .timeline-item.active .timeline-card-content::before {
        background: rgb(34 34 34) !important;
        border-color: transparent;
    }

    .timeline-description {
        color: rgba(255, 255, 255, 0.8);
        font-size: 1rem;
        line-height: 1.6;
        /* padding-bottom: 1.5rem; */
    }

    /* Skeleton Loading - Timeline Format */
    .skeleton-entry {
        opacity: 0;
        animation: fade-in-up 0.5s ease forwards;
        animation-delay: var(--delay);
    }

    .skeleton-timeline .timeline-item {
        opacity: 0.3;
        cursor: default;
    }

    .skeleton-timeline {
        margin-top: 2.8rem;
    }

    .skeleton-timeline .timeline-line {
        bottom: 160px;
        transform-origin: top;
        opacity: 0;
        animation: timeline-draw 0.3s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        animation-delay: 150ms;
    }

    @keyframes timeline-draw {
        from {
            opacity: 0;
            transform: scaleY(0);
        }
        to {
            opacity: 1;
            transform: scaleY(1);
        }
    }

    .skeleton-timeline .timeline-card-content {
        height: 120px;
    }

    @keyframes fade-in-up {
        from {
            opacity: 0;
            transform: translateY(10px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .step-description {
        color: rgba(255, 255, 255, 0.8);
        line-height: 1.6;
        font-size: 0.9rem;
        padding-left: 3rem;
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
        .landing-background {
            background-position: left;
        }
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
        .landing-header {
            top: 30%;
        }
        .landing-tagline {
            font-size: 1.2rem;
            line-height: 1.5;
            padding: 0;
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
        .features-container {
            top: 52%;
            flex-direction: column;
            background: rgba(0, 0, 0, 0.4);
            backdrop-filter: blur(6px);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 24px;
            padding: 1.5rem;
            gap: 1rem;
            width: calc(100% - 2rem);
            max-width: 380px;
        }
        .step-description {
            padding-left: 0;
        }
        .corner-gradient.visible {
            background: linear-gradient(
                180deg,
                rgba(0, 0, 0, 0.7) 10%,
                rgba(0, 0, 0, 0) 20%
            );
        }
        .feature-card {
            width: 100% !important;
            flex-direction: row !important;
            justify-content: flex-start !important;
            text-align: left !important;
            padding: 0 !important;
            gap: 1rem !important;
            background: transparent !important;
            border: none !important;
            transform: none !important;
        }
        .feature-card:last-child {
            width: 100% !important;
            background: transparent !important;
            border: none !important;
            padding: 0 !important;
        }
        :global(.feature-icon-wrapper img) {
            width: 32px !important;
        }
        .feature-text {
            font-size: 1rem;
            line-height: 1.4;
            color: rgba(255, 255, 255, 0.8);
            text-align: left;
            font-weight: 400;
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
            padding: 0.5rem !important;
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
            height: 400px; /* Increased further to handle longer descriptions */
            max-width: none;
            width: 100%;
            display: flex;
            flex-direction: column;
            pointer-events: auto;
            z-index: 10;
        }

        .mobile-dish-header {
            padding: 1rem 1.5rem 0.5rem 1.5rem;
            text-align: left;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(
                to top,
                rgba(0, 0, 0, 0.8),
                transparent
            );
        }

        .mobile-dish-title {
            color: white;
            font-size: 1.25rem;
            font-weight: 700;
            margin: 0;
            text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
            text-align: center;
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
            padding: 0 1.5rem calc(1rem + env(safe-area-inset-bottom)); /* Respect safe area on mobile */
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

        .timeline-line {
            display: none;
        }

        .timeline-marker-wrapper {
            display: none;
        }

        .cards-panel::-webkit-scrollbar {
            display: none;
        }

        .title-card {
            display: flex;
            flex-direction: column;
            justify-content: center;
            height: auto;
            align-self: center;
        }

        .timeline-item,
        .end-card {
            flex-shrink: 0;
            width: 70vw;
            height: 100%; /* Fill panel height */
            scroll-snap-align: center;
            scroll-snap-stop: always;
            margin-bottom: 0 !important;
            display: flex;
            flex-direction: column; /* Ensure vertical stretching of children */
            padding: 0.5rem 0;
        }

        .timeline-item :global(.glass-card),
        .end-card :global(.glass-card) {
            height: 100%;
            width: 100%;
            display: flex;
            flex-direction: column;
            flex: 1; /* Stretch to fill timeline-item height */
            margin-top: 0.5rem;
        }

        .timeline-content {
            display: flex;
            flex-direction: column;
            height: 100%;
        }

        .timeline-card-content {
            flex: 1; /* Stretch to fill timeline-content height */
            display: flex;
            flex-direction: column;
            min-height: 0; /* Important for overflow: auto in flexbox */
            overflow: visible;
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

        .map-container {
            top: 60px; /* Move map down to clear space for header */
        }
    }

    /* Skeleton Animations */
    @keyframes slideUpFade {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .skeleton-entry {
        animation: slideUpFade 0.5s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        opacity: 0; /* Start hidden */
        animation-delay: var(--delay, 0ms);
    }
</style>
