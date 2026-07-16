# -*- coding: utf-8 -*-
"""English · Journey Through the Solar System (CLIL/ESL, ~46 min)"""
from engine import Deck, THEMES

THEME = "cosmos"
IMAGES = {
    "hero":   ("breathtaking view of the solar system, the sun and planets aligned in space, colorful nebula background, stars, epic cinematic space art, ultra detailed, awe inspiring", "16:9"),
    "sun":    ("the Sun as a glowing ball of fire in space, solar flares and prominences, intense golden orange, dramatic close up, NASA style space photography, powerful", "16:9"),
    "earth":  ("planet Earth from space, blue oceans white clouds green continents, the moon nearby, stars in background, stunning realistic space photography, beautiful", "16:9"),
    "mars":   ("planet Mars, the red planet, rusty craters and canyons, thin atmosphere, realistic space photography, dramatic reddish tones, detailed", "16:9"),
    "jupiter":("planet Jupiter, giant gas planet with swirling bands and the great red spot, colorful storms, majestic and huge, realistic space art, detailed", "16:9"),
    "saturn": ("planet Saturn with its magnificent rings, golden and pale tones, tilted view, stars in background, breathtaking realistic space photography, elegant", "16:9"),
    "rocket": ("a rocket launching into space with fire and smoke, blue sky turning to stars, sense of adventure and exploration, dynamic cinematic, inspiring", "16:9"),
    "astro":  ("an astronaut floating in space with Earth in the background, reflection in helmet visor, stars, awe and wonder, realistic detailed space photography", "16:9"),
    "close":  ("a child looking up at a spectacular starry night sky and the milky way, sense of wonder and dreams, silhouette, magical inspiring, wide cinematic", "16:9"),
}


def build(P):
    d = Deck(THEMES[THEME])

    d.title_hero(P["hero"], "ENGLISH · SCIENCE UNIT",
                 ["Journey Through", "the Solar System"],
                 "Explore the planets and learn to describe our universe", "READING · VOCABULARY · SPEAKING · 45 MIN")

    d.bullets("MISSION MAP", "Today's space mission", [
        ("Blast Off", "Warm-up quiz: how much do you know about space?"),
        ("The Sun & 8 Planets", "Meet every member of our solar system"),
        ("Planet Vocabulary", "Words to describe size, distance and features"),
        ("Reading & Facts", "Amazing facts and comparing planets"),
        ("Speak & Create", "Design your own planet and present it"),
    ], pageno=2)

    d.statement("How many planets are there in our solar system?",
                "The answer is EIGHT — let's meet them one by one!", accent_bg=True)

    d.divider(P["sun"], "01", "The Sun", "The star at the centre of everything")

    d.image_text(P["sun"], "THE SUN", "Our nearest star",
                 ["The Sun is a huge ball of hot burning gas at the centre of the solar system.",
                  "It is about 1.3 million times bigger than Earth!",
                  "The Sun gives us light and heat. Without it, there would be no life.",
                  "Word bank: star · gas · heat · light · centre · gravity"],
                 side="left", pageno=3)

    d.divider(P["earth"], "02", "The Eight Planets", "From tiny Mercury to giant Jupiter")

    d.fullbleed_caption(P["earth"], "EARTH — our home planet",
                        "The only planet with life, liquid water and air we can breathe. It has one moon.", pageno=4)
    d.fullbleed_caption(P["mars"], "MARS — the red planet",
                        "Cold and dusty with rusty red soil. Robots called rovers explore it today.", pageno=5)
    d.fullbleed_caption(P["jupiter"], "JUPITER — the biggest planet",
                        "A giant made of gas, with a huge storm called the Great Red Spot.", pageno=6)
    d.fullbleed_caption(P["saturn"], "SATURN — the ringed planet",
                        "Famous for its beautiful rings made of ice and rock. It has over 140 moons!", pageno=7)

    d.cards("VOCABULARY", "Words to describe planets", [
        ("size", "huge · giant · tiny · small — “Jupiter is the biggest planet.”"),
        ("distance", "near · far · closest · farthest — “Mercury is closest to the Sun.”"),
        ("temperature", "hot · cold · freezing · burning — “Mars is very cold.”"),
        ("surface", "rocky · icy · dusty · gassy — “Mars has a dusty surface.”"),
        ("features", "rings · moons · craters · storms — “Saturn has rings.”"),
        ("compare", "bigger · smaller · hotter · colder than…"),
    ], cols=3, pageno=8)

    d.two_col("GRAMMAR FOCUS", "Comparing the planets",
              "Comparatives", ["Jupiter is bigger than Earth.",
                               "Mars is colder than Earth.",
                               "Mercury is closer to the Sun than Venus."],
              "Superlatives", ["Jupiter is the biggest planet.",
                               "Mercury is the closest to the Sun.",
                               "Venus is the hottest planet."],
              pageno=9)

    d.divider(P["astro"], "03", "Amazing Space Facts", "Did you know…?")

    d.bullets("READING", "Five out-of-this-world facts", [
        ("A day on Venus is longer than its year", "Venus spins very, very slowly."),
        ("You could fit 1,300 Earths inside Jupiter", "It is truly a giant."),
        ("Mars has the tallest volcano in the solar system", "Olympus Mons is 3× taller than Mount Everest."),
        ("Saturn would float on water", "It is lighter than water for its size."),
        ("Space is completely silent", "There is no air to carry sound."),
    ], img=P["jupiter"], pageno=10)

    d.image_text(P["astro"], "READING", "Life as an astronaut",
                 ["Astronauts float in space because there is very little gravity.",
                  "They wear special suits to breathe and stay warm — space is freezing!",
                  "They eat food from packets and even sleep floating, tied to a wall.",
                  "Question: Would you like to be an astronaut? Why or why not?"],
                 side="right", pageno=11)

    d.divider(P["rocket"], "04", "Your Mission", "Design a planet, present to the crew")

    d.cards("PROJECT FRAME", "Invent your own planet (use these prompts)", [
        ("① Name", "“My planet is called ______.”"),
        ("② Size & distance", "“It is ______ than Earth and very ______ from the Sun.”"),
        ("③ Weather & surface", "“It is ______ and has a ______ surface.”"),
        ("④ Special feature", "“It has ______ and ______ moons.”"),
    ], cols=2, pageno=12)

    d.bullets("ACTIVITY", "Explore, speak and create", [
        ("Fact race (6 min)", "In teams, match planets to their descriptions"),
        ("Design time (8 min)", "Draw and name your own planet using the frame"),
        ("Presentation (10 min)", "Present your planet to the class in 4–5 sentences"),
    ], img=P["saturn"], pageno=13)

    d.closing(P["close"], "Keep looking up",
              ["Our solar system is vast, beautiful and full of mysteries.",
               "The more we learn, the more amazing questions we can ask.",
               "Homework: Write 5 sentences about your favourite planet and draw it."],
              "ENGLISH · JOURNEY THROUGH THE SOLAR SYSTEM")

    return d
