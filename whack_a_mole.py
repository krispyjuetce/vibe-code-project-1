import random
import sys

import pygame


# Window and grid settings
WIDTH, HEIGHT = 800, 600
GRID_COLS, GRID_ROWS = 4, 3
GRID_PADDING = 80
START_MOVE_INTERVAL_MS = 1000
MIN_MOVE_INTERVAL_MS = 600
SCORE_FOR_MAX_DIFFICULTY = 35

# Gameplay settings
START_HEALTH = 5
FPS = 60

# Colors
BG_TOP_COLOR = (8, 18, 45)
BG_BOTTOM_COLOR = (3, 42, 64)
GRID_COLOR = (95, 225, 255)
BLUE_MOLE_COLOR = (35, 250, 230)
BLUE_MOLE_HIT_COLOR = (160, 255, 245)
RED_MOLE_COLOR = (255, 70, 120)
RED_MOLE_HIT_COLOR = (255, 170, 195)
TEXT_COLOR = (245, 245, 245)
GAME_OVER_COLOR = (255, 125, 150)


def build_grid_rects():
    grid_width = WIDTH - 2 * GRID_PADDING
    grid_height = HEIGHT - 2 * GRID_PADDING

    cell_width = grid_width // GRID_COLS
    cell_height = grid_height // GRID_ROWS
    square_size = min(cell_width, cell_height) - 24

    rects = []
    for row in range(GRID_ROWS):
        for col in range(GRID_COLS):
            cell_x = GRID_PADDING + col * cell_width
            cell_y = GRID_PADDING + row * cell_height

            rect_x = cell_x + (cell_width - square_size) // 2
            rect_y = cell_y + (cell_height - square_size) // 2
            rects.append(pygame.Rect(rect_x, rect_y, square_size, square_size))
    return rects


def pick_new_mole_rect(rects, current_rect):
    choices = [r for r in rects if r != current_rect]
    return random.choice(choices) if choices else current_rect


def reset_game(rects):
    return {
        "score": 0,
        "health": START_HEALTH,
        "game_over": False,
        "mole_rect": random.choice(rects),
        "mole_is_blue": random.choice([True, False]),
        "mole_hit": False,
        "last_move_time": pygame.time.get_ticks(),
    }


def draw_neon_background(screen):
    for y in range(HEIGHT):
        t = y / HEIGHT
        r = int(BG_TOP_COLOR[0] + (BG_BOTTOM_COLOR[0] - BG_TOP_COLOR[0]) * t)
        g = int(BG_TOP_COLOR[1] + (BG_BOTTOM_COLOR[1] - BG_TOP_COLOR[1]) * t)
        b = int(BG_TOP_COLOR[2] + (BG_BOTTOM_COLOR[2] - BG_TOP_COLOR[2]) * t)
        pygame.draw.line(screen, (r, g, b), (0, y), (WIDTH, y))


def draw_grid_lines(screen):
    grid_width = WIDTH - 2 * GRID_PADDING
    grid_height = HEIGHT - 2 * GRID_PADDING
    cell_width = grid_width // GRID_COLS
    cell_height = grid_height // GRID_ROWS

    glow = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)

    for c in range(GRID_COLS + 1):
        x = GRID_PADDING + c * cell_width
        pygame.draw.line(glow, (GRID_COLOR[0], GRID_COLOR[1], GRID_COLOR[2], 60), (x, GRID_PADDING), (x, GRID_PADDING + grid_height), 8)
        pygame.draw.line(screen, GRID_COLOR, (x, GRID_PADDING), (x, GRID_PADDING + grid_height), 2)

    for r in range(GRID_ROWS + 1):
        y = GRID_PADDING + r * cell_height
        pygame.draw.line(glow, (GRID_COLOR[0], GRID_COLOR[1], GRID_COLOR[2], 60), (GRID_PADDING, y), (GRID_PADDING + grid_width, y), 8)
        pygame.draw.line(screen, GRID_COLOR, (GRID_PADDING, y), (GRID_PADDING + grid_width, y), 2)

    screen.blit(glow, (0, 0))


def get_move_interval_ms(score):
    progress = min(1.0, score / SCORE_FOR_MAX_DIFFICULTY)
    span = START_MOVE_INTERVAL_MS - MIN_MOVE_INTERVAL_MS
    return int(START_MOVE_INTERVAL_MS - span * progress)


def main():
    pygame.init()
    screen = pygame.display.set_mode((WIDTH, HEIGHT))
    pygame.display.set_caption("Whack-a-Mole (Square)")
    clock = pygame.time.Clock()

    font = pygame.font.SysFont(None, 36)
    big_font = pygame.font.SysFont(None, 56)

    grid_rects = build_grid_rects()
    state = reset_game(grid_rects)

    while True:
        now = pygame.time.get_ticks()

        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                pygame.quit()
                sys.exit()

            if event.type == pygame.KEYDOWN and event.key == pygame.K_r and state["game_over"]:
                state = reset_game(grid_rects)

            if event.type == pygame.MOUSEBUTTONDOWN and event.button == 1 and not state["game_over"]:
                if state["mole_rect"].collidepoint(event.pos) and not state["mole_hit"]:
                    if state["mole_is_blue"]:
                        state["score"] += 1
                        state["mole_hit"] = True

        current_interval = get_move_interval_ms(state["score"])

        if not state["game_over"] and now - state["last_move_time"] >= current_interval:
            if state["mole_is_blue"] and not state["mole_hit"]:
                state["health"] -= 1
                if state["health"] <= 0:
                    state["game_over"] = True

            if not state["game_over"]:
                state["mole_rect"] = pick_new_mole_rect(grid_rects, state["mole_rect"])
                state["mole_is_blue"] = random.choice([True, False])
                state["mole_hit"] = False
                state["last_move_time"] = now

        draw_neon_background(screen)
        draw_grid_lines(screen)

        if state["mole_is_blue"]:
            mole_color = BLUE_MOLE_HIT_COLOR if state["mole_hit"] else BLUE_MOLE_COLOR
        else:
            mole_color = RED_MOLE_HIT_COLOR if state["mole_hit"] else RED_MOLE_COLOR
        mole_glow = pygame.Surface((WIDTH, HEIGHT), pygame.SRCALPHA)
        glow_rect = state["mole_rect"].inflate(20, 20)
        pygame.draw.rect(mole_glow, (mole_color[0], mole_color[1], mole_color[2], 70), glow_rect, border_radius=8)
        screen.blit(mole_glow, (0, 0))
        pygame.draw.rect(screen, mole_color, state["mole_rect"])

        score_surf = font.render(f"Score: {state['score']}", True, TEXT_COLOR)
        health_surf = font.render(f"Health: {state['health']}", True, TEXT_COLOR)
        speed_surf = font.render(f"Respawn: {current_interval / 1000:.2f}s", True, TEXT_COLOR)
        rule_surf = font.render("Blue: click | Red: ignore", True, TEXT_COLOR)
        screen.blit(score_surf, (20, 18))
        screen.blit(health_surf, (WIDTH - health_surf.get_width() - 20, 18))
        screen.blit(speed_surf, ((WIDTH - speed_surf.get_width()) // 2, 18))
        screen.blit(rule_surf, ((WIDTH - rule_surf.get_width()) // 2, HEIGHT - 44))

        if state["game_over"]:
            over_surf = big_font.render("Game Over", True, GAME_OVER_COLOR)
            restart_surf = font.render("Press R to restart", True, TEXT_COLOR)
            screen.blit(over_surf, ((WIDTH - over_surf.get_width()) // 2, HEIGHT // 2 - 50))
            screen.blit(restart_surf, ((WIDTH - restart_surf.get_width()) // 2, HEIGHT // 2 + 5))

        pygame.display.flip()
        clock.tick(FPS)


if __name__ == "__main__":
    main()
