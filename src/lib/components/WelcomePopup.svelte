<script lang="ts">
    import { onMount } from "svelte";
    import gsap from "gsap";

    let {
        onClose = () => {},
    }: {
        onClose?: () => void;
    } = $props();

    let isMobile = $state(false);
    let backdropEl: HTMLDivElement;
    let modalEl: HTMLDivElement;
    let iconsRow1El: HTMLDivElement;
    let iconsRow2El: HTMLDivElement;
    let titleEl: HTMLHeadingElement;
    let featuresEl: HTMLDivElement;
    let buttonEl: HTMLButtonElement;

    // Colorful food emojis for the animated header
    const foodEmojisRow1 = ["🌮", "🍕", "🍦", "🍣", "🍩", "🥐", "🍔"];
    const foodEmojisRow2 = ["🍿", "🧁", "🍜", "🥗", "🍱", "🍰", "🌯"];

    // Duplicate for seamless infinite scroll
    const row1Emojis = [...foodEmojisRow1, ...foodEmojisRow1];
    const row2Emojis = [...foodEmojisRow2, ...foodEmojisRow2];

    function handleBackdropClick(e: MouseEvent) {
        if (e.target === backdropEl) {
            closePopup();
        }
    }

    let startY = 0;
    let currentY = 0;
    let isDragging = false;

    function handleTouchStart(e: TouchEvent) {
        if (!isMobile) return;
        startY = e.touches[0].clientY;
        isDragging = true;
    }

    function handleTouchMove(e: TouchEvent) {
        if (!isMobile || !isDragging) return;
        const deltaY = e.touches[0].clientY - startY;
        if (deltaY > 0) {
            currentY = deltaY;
            gsap.set(modalEl, { y: currentY });
            // Fade backdrop based on drag distance
            const progress = currentY / modalEl.offsetHeight;
            gsap.set(backdropEl, { opacity: 1 - progress });
        }
    }

    function handleTouchEnd() {
        if (!isMobile || !isDragging) return;
        isDragging = false;
        if (currentY > 100) {
            closePopup();
        } else {
            // Snap back
            gsap.to(modalEl, { y: 0, duration: 0.3, ease: "power3.out" });
            gsap.to(backdropEl, { opacity: 1, duration: 0.3 });
        }
        currentY = 0;
    }

    function closePopup() {
        // Exit animation
        const tl = gsap.timeline({
            onComplete: onClose,
        });

        if (isMobile) {
            tl.to(modalEl, {
                y: "100%",
                duration: 0.3,
                ease: "power2.in",
            });
        } else {
            tl.to(modalEl, {
                scale: 0.9,
                opacity: 0,
                duration: 0.25,
                ease: "power2.in",
            });
        }

        tl.to(
            backdropEl,
            {
                opacity: 0,
                duration: 0.2,
            },
            "-=0.1",
        );
    }

    onMount(() => {
        isMobile = window.innerWidth <= 768;

        // Initial states
        gsap.set(backdropEl, { opacity: 0 });

        if (isMobile) {
            gsap.set(modalEl, { y: "100%" });
        } else {
            gsap.set(modalEl, { scale: 0.9, opacity: 0 });
        }

        // Get all icon elements
        const iconElements = [
            ...iconsRow1El.querySelectorAll(".food-icon"),
            ...iconsRow2El.querySelectorAll(".food-icon"),
        ];
        gsap.set(iconElements, { scale: 0 });
        gsap.set(titleEl, { opacity: 0, y: 20 });
        gsap.set(featuresEl.children, { opacity: 0, y: 15 });
        gsap.set(buttonEl, { opacity: 0, y: 15 });

        // Main animation timeline
        const tl = gsap.timeline();

        // 1. Backdrop fade in
        tl.to(backdropEl, {
            opacity: 1,
            duration: 0.3,
            ease: "power2.out",
        });

        // 2. Modal entrance
        if (isMobile) {
            tl.to(
                modalEl,
                {
                    y: "0%",
                    duration: 0.4,
                    ease: "power3.out",
                },
                "-=0.1",
            );
        } else {
            tl.to(
                modalEl,
                {
                    scale: 1,
                    opacity: 1,
                    duration: 0.4,
                    ease: "back.out(1.4)",
                },
                "-=0.1",
            );
        }

        // 3. Food icons random scale-up
        // Shuffle the icon elements for random order
        const shuffledIcons = [...iconElements].sort(() => Math.random() - 0.5);
        tl.to(
            shuffledIcons,
            {
                scale: 1,
                duration: 0.25,
                stagger: 0.03,
                ease: "back.out(1.7)",
            },
            "-=0.25",
        );

        // 4. Content stagger in (starts shortly after icons begin popping)
        tl.to(
            titleEl,
            {
                opacity: 1,
                y: 0,
                duration: 0.3,
                ease: "power2.out",
            },
            "-=1.6",
        );

        tl.to(
            featuresEl.children,
            {
                opacity: 1,
                y: 0,
                duration: 0.3,
                stagger: 0.05,
                ease: "power2.out",
            },
            "-=1.3",
        );

        tl.to(
            buttonEl,
            {
                opacity: 1,
                y: 0,
                duration: 0.3,
                ease: "power2.out",
            },
            "-=1.0",
        );

        // 5. Start infinite horizontal scroll after icons are visible
        tl.add(() => {
            // Row 1 scrolls left
            gsap.to(iconsRow1El, {
                xPercent: -50,
                duration: 20,
                ease: "none",
                repeat: -1,
            });

            // Row 2 scrolls right (opposite direction, slightly different speed)
            gsap.fromTo(
                iconsRow2El,
                { xPercent: -50 },
                {
                    xPercent: 0,
                    duration: 25,
                    ease: "none",
                    repeat: -1,
                },
            );
        }, "-=0.5");

        return () => {
            // Cleanup animations on unmount
            gsap.killTweensOf([
                backdropEl,
                modalEl,
                iconsRow1El,
                iconsRow2El,
                titleEl,
                buttonEl,
                ...iconElements,
            ]);
        };
    });
</script>

<div
    class="welcome-backdrop"
    bind:this={backdropEl}
    onclick={handleBackdropClick}
    onkeydown={(e) => e.key === "Escape" && closePopup()}
    role="dialog"
    aria-modal="true"
    tabindex="-1"
>
    <div
        class="welcome-modal"
        class:mobile={isMobile}
        bind:this={modalEl}
        ontouchstart={handleTouchStart}
        ontouchmove={handleTouchMove}
        ontouchend={handleTouchEnd}
    >
        {#if isMobile}
            <div class="drag-handle-container">
                <div class="drag-handle"></div>
            </div>
        {/if}
        <!-- Food Icons Header -->
        <div class="icons-container">
            <div class="icons-row" bind:this={iconsRow1El}>
                {#each row1Emojis as emoji, i}
                    <div class="food-icon">
                        <span class="emoji">{emoji}</span>
                    </div>
                {/each}
            </div>
            <div class="icons-row" bind:this={iconsRow2El}>
                {#each row2Emojis as emoji, i}
                    <div class="food-icon">
                        <span class="emoji">{emoji}</span>
                    </div>
                {/each}
            </div>
        </div>

        <!-- Content -->
        <div class="content">
            <h2 class="title" bind:this={titleEl}>Welcome to Forklore!</h2>

            <div class="features" bind:this={featuresEl}>
                <div class="feature-item">
                    <span class="feature-icon">🔍</span>
                    <div class="feature-text">
                        <h3>Pick any dish</h3>
                        <p>
                            From street food to fine dining, just type a name.
                        </p>
                    </div>
                </div>

                <div class="feature-item">
                    <span class="feature-icon">✨</span>
                    <div class="feature-text">
                        <h3>Watch AI generate history</h3>
                        <p>
                            We build a unique timeline for your dish in
                            real-time.
                        </p>
                    </div>
                </div>

                <div class="feature-item">
                    <span class="feature-icon">🗺️</span>
                    <div class="feature-text">
                        <h3>Travel the map</h3>
                        <p>
                            Follow the ingredients across borders and centuries.
                        </p>
                    </div>
                </div>
            </div>

            <button
                class="cta-button"
                bind:this={buttonEl}
                onclick={closePopup}
            >
                Start Exploring
            </button>
        </div>
    </div>
</div>

<style>
    .welcome-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.75);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: 1rem;
    }

    .welcome-modal {
        border-radius: 28px;
        max-width: 420px;
        width: 100%;
        overflow: hidden;
        box-shadow:
            0 25px 50px rgba(0, 0, 0, 0.5),
            0 0 0 1px rgba(255, 255, 255, 0.1);
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
    }

    .welcome-modal.mobile {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        max-width: none;
        border-radius: 24px 24px 0 0;
        max-height: 90vh;
        overflow-y: auto;
    }

    /* Drag Handle */
    .drag-handle-container {
        display: none;
        padding-top: 8px;
        padding-bottom: 8px;
        justify-content: center;
        align-items: center;
        width: 100%;
        cursor: grab;
    }

    .drag-handle {
        width: 36px;
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 6px;
    }

    /* Icons Container */
    .icons-container {
        padding: 1.5rem 0;
        overflow: hidden;
    }

    .icons-row {
        display: flex;
        gap: 0.75rem;
        padding: 0.5rem 0;
        width: max-content;
    }

    .food-icon {
        width: 56px;
        height: 56px;
        background: rgba(40, 40, 40, 0.8);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        background:
            linear-gradient(rgba(51, 51, 51, 1), rgba(51, 51, 51, 1))
                padding-box,
            linear-gradient(
                    180deg,
                    rgba(255, 255, 255, 0.3) 0%,
                    rgba(255, 255, 255, 0.1) 100%
                )
                border-box;
        border: 1px solid transparent;
    }

    .emoji {
        font-size: 1.75rem;
        line-height: 1;
    }

    /* Content */
    .content {
        padding: 0rem 2rem 2rem 2rem;
    }

    .title {
        font-size: 1.6rem;
        font-weight: 600;
        color: white;
        text-align: center;
        margin: 0 0 2rem;
    }

    .features {
        display: flex;
        flex-direction: column;
        gap: 2rem;
        margin-bottom: 1.75rem;
    }

    .feature-item {
        display: flex;
        align-items: flex-start;
        gap: 1rem;
    }

    .feature-icon {
        font-size: 1.5rem;
        line-height: 1;
        flex-shrink: 0;
        margin-top: 0.1rem;
    }

    .feature-text h3 {
        font-size: 1rem;
        font-weight: 500;
        color: rgba(255, 255, 255, 0.8);
        margin: 0 0 0.1rem;
    }

    .feature-text p {
        font-size: 0.875rem;
        color: rgba(255, 255, 255, 0.5);
        margin: 0;
        line-height: 1.4;
    }

    .cta-button {
        width: 100%;
        padding: 1rem;
        background: linear-gradient(135deg, #e48709 0%, #f59e0c 100%);
        color: #1a1a1a;
        font-size: 1rem;
        font-weight: 600;
        border: none;
        border-radius: 50px;
        cursor: pointer;
        opacity: 1;
        transition: opacity 0.2s ease;
    }

    .cta-button:hover {
        opacity: 0.8;
    }

    /* Mobile adjustments */
    @media (max-width: 768px) {
        .welcome-backdrop {
            padding: 0;
            align-items: flex-end;
        }

        .drag-handle-container {
            display: flex;
        }

        .icons-container {
            padding-top: 0.5rem;
        }

        .content {
            padding: 0rem 1.5rem 2rem;
            padding-bottom: calc(2rem + env(safe-area-inset-bottom));
        }

        .title {
            font-size: 1.5rem;
        }

        .feature-text h3 {
            font-size: 1.1rem;
        }

        .feature-text p {
            font-size: 0.9rem;
        }
    }
</style>
