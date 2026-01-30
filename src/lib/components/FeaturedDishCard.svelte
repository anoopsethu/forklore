<script lang="ts">
    import { fade } from "svelte/transition";

    interface FeaturedDish {
        name: string;
        emoji: string;
        region: string;
        trivia: string;
        lat: number;
        lng: number;
    }

    let {
        dish,
        isActive = false,
        isLoading = false,
        onclick = () => {},
    }: {
        dish: FeaturedDish;
        isActive?: boolean;
        isLoading?: boolean;
        onclick?: () => void;
    } = $props();

    let displayEmoji = $derived(dish.emoji.length > 2 ? "🍲" : dish.emoji);
</script>

<button
    class="featured-card"
    class:active={isActive}
    class:loading={isLoading}
    {onclick}
    transition:fade={{ duration: 200 }}
>
    <span class="dish-emoji">{displayEmoji}</span>
    <div class="dish-info">
        <span class="dish-name">{dish.name}</span>
        <span class="dish-region">{dish.region.toUpperCase()}</span>
    </div>
</button>

<style>
    .featured-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
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
        border-radius: 16px;
        cursor: pointer;
        transition: all 0.2s ease;
        text-align: center;
        height: 135px;
    }

    .featured-card:hover {
        background:
            linear-gradient(rgba(30, 30, 30, 0.8), rgba(30, 30, 30, 0.8))
                padding-box,
            linear-gradient(
                    180deg,
                    rgba(255, 255, 255, 0.35) 0%,
                    rgba(255, 255, 255, 0.15) 100%
                )
                border-box;
        transform: translateY(-2px);
    }

    .featured-card.active {
        background:
            linear-gradient(rgba(60, 60, 60, 0.9), rgba(60, 60, 60, 0.9))
                padding-box,
            linear-gradient(
                    135deg,
                    rgba(255, 140, 0, 0.5) 0%,
                    rgba(255, 140, 0, 0.1) 50%,
                    rgba(255, 140, 0, 0.3) 100%
                )
                border-box;
    }

    .featured-card.loading {
        opacity: 0.7;
        pointer-events: none;
    }

    .dish-emoji {
        font-size: 2rem;
        line-height: 1;
        margin-bottom: 0.25rem;
    }

    .dish-info {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.1rem;
        width: 100%;
    }

    .dish-name {
        color: white;
        font-size: 0.95rem;
        font-weight: 500;
        line-height: 1.25;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
        word-break: break-word;
        width: 100%;
        flex-shrink: 0;
    }

    .dish-region {
        color: rgba(255, 255, 255, 0.6);
        font-size: 0.7rem;
        font-weight: 500;
        letter-spacing: 0.05em;
        margin-top: -0.2rem;
    }

    /* Mobile */
    @media (max-width: 768px) {
        .featured-card {
            flex-direction: row;
            align-items: center;
            justify-content: flex-start;
            padding: 0.75rem 1rem;
            height: auto;
            min-height: 70px;
            gap: 1rem;
            text-align: left;
        }

        .dish-info {
            align-items: flex-start;
        }

        .dish-emoji {
            font-size: 1.75rem;
            margin-bottom: 0;
        }

        .dish-name {
            font-size: 0.9rem;
        }

        .dish-region {
            font-size: 0.65rem;
        }
    }
</style>
