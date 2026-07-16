# -*- coding: utf-8 -*-
"""English · The Four Seasons (ESL, ~46 min)"""
from engine import Deck, THEMES

THEME = "seasons"
IMAGES = {
    "hero":   ("a single tree shown in four seasons split across one image, spring blossoms summer green autumn gold winter snow, beautiful nature photography, vivid colorful, cinematic wide", "16:9"),
    "spring": ("vibrant spring scene, cherry blossoms in full bloom, green meadow with wildflowers, baby lambs, blue sky, bright cheerful nature photography, fresh and lively", "16:9"),
    "summer": ("golden summer beach and sunflower field under bright blue sky, warm sunshine, kids playing, ice cream, joyful vivid summer photography, vibrant", "16:9"),
    "autumn": ("stunning autumn forest with red orange and yellow leaves, a path covered in fallen leaves, warm golden light, cozy atmospheric nature photography", "16:9"),
    "winter": ("magical snowy winter landscape, pine trees covered in snow, a cozy cabin with glowing windows, soft falling snowflakes, blue hour, serene beautiful", "16:9"),
    "weather":("collage of weather icons in a beautiful sky, sun clouds rain rainbow snow wind, bright educational illustration, colorful clean modern flat style", "16:9"),
    "clothes":("flat lay of seasonal clothing neatly arranged, t-shirt shorts coat scarf boots sunglasses, bright colors on clean background, cheerful product photography", "16:9"),
    "activity":("children doing seasonal activities collage, flying kite building sandcastle jumping in leaves making snowman, joyful bright illustration, wholesome", "16:9"),
    "close":  ("peaceful nature landscape at golden sunset with a rainbow, rolling hills, sense of wonder and calm, inspiring beautiful photography, wide cinematic", "16:9"),
}


def build(P):
    d = Deck(THEMES[THEME])

    d.title_hero(P["hero"], "ENGLISH · UNIT 6",
                 ["The Four", "Seasons"],
                 "Talking about seasons, weather, clothes and activities", "SPEAKING · VOCABULARY · READING · 45 MIN")

    d.bullets("LESSON MAP", "What we will learn today", [
        ("Warm-up & Goals", "Sing, guess and set our learning targets"),
        ("Vocabulary", "Seasons, weather words, clothes and activities"),
        ("Reading", "A short passage: “My Favourite Season”"),
        ("Grammar Focus", "What's the weather like? / What do you do in…?"),
        ("Speaking & Writing", "Talk about your favourite season and write about it"),
    ], pageno=2)

    d.statement("Can you name all four seasons in English?",
                "Spring · Summer · Autumn (Fall) · Winter — let's explore each one!", accent_bg=True)

    d.divider(P["spring"], "01", "Seasons Vocabulary", "Four seasons, four colours, four moods")

    d.fullbleed_caption(P["spring"], "SPRING", "warm · green · flowers bloom · it gets warmer", pageno=3)
    d.fullbleed_caption(P["summer"], "SUMMER", "hot · sunny · long days · we go to the beach", pageno=4)
    d.fullbleed_caption(P["autumn"], "AUTUMN / FALL", "cool · windy · leaves fall · golden colours", pageno=5)
    d.fullbleed_caption(P["winter"], "WINTER", "cold · snowy · short days · we wear warm coats", pageno=6)

    d.divider(P["weather"], "02", "Weather Words", "What's the weather like today?")

    d.cards("VOCABULARY", "Key weather adjectives", [
        ("sunny ☀", "The sky is clear and the sun is shining. “It's sunny today.”"),
        ("rainy 🌧", "Water falls from the clouds. Don't forget your umbrella!"),
        ("windy 🌬", "The wind blows strongly. Good for flying a kite!"),
        ("snowy ❄", "Soft white snow falls. Let's build a snowman!"),
        ("cloudy ☁", "The sky is grey and full of clouds."),
        ("foggy 🌫", "It's hard to see far. Drive carefully!"),
    ], cols=3, pageno=7)

    d.two_col("GRAMMAR FOCUS", "Two questions you can always use",
              "Ask about weather", ["What's the weather like?",
                                    "→ It's sunny and warm.",
                                    "What's the weather like in summer?",
                                    "→ It's hot and sunny."],
              "Ask about activities", ["What do you do in winter?",
                                       "→ I make a snowman.",
                                       "What do you do in spring?",
                                       "→ I plant flowers and fly kites."],
              pageno=8)

    d.image_text(P["clothes"], "VOCABULARY", "What do we wear?",
                 ["In spring and autumn: a light jacket, a sweater, jeans.",
                  "In summer: a T-shirt, shorts, sandals, sunglasses, a hat.",
                  "In winter: a warm coat, a scarf, gloves, boots.",
                  "Try it: “When it's cold, I wear ______.”"],
                 side="right", pageno=9)

    d.divider(P["autumn"], "03", "Reading Time", "“My Favourite Season”")

    d.image_text(P["autumn"], "READING", "My Favourite Season",
                 ["My favourite season is autumn. The weather is cool and the leaves turn red and gold.",
                  "I like to walk in the park and jump in the leaves with my friends.",
                  "We wear warm sweaters and drink hot tea. Autumn is quiet and beautiful.",
                  "What is YOUR favourite season, and why?"],
                 side="left", pageno=10)

    d.bullets("COMPREHENSION", "Answer these questions", [
        ("1. What is the writer's favourite season?", "Look at the first sentence."),
        ("2. What is the weather like?", "Find two weather words in the text."),
        ("3. What does the writer do?", "Name one activity from the passage."),
        ("4. What do they wear and drink?", "Two things to find."),
    ], img=P["autumn"], pageno=11)

    d.divider(P["activity"], "04", "Let's Speak", "Tell us about YOUR season")

    d.cards("SPEAKING FRAME", "Use this frame to talk (2 minutes)", [
        ("① Name it", "“My favourite season is ______.”"),
        ("② Describe weather", "“The weather is ______ and ______.”"),
        ("③ Say activities", "“I like to ______ and ______.”"),
        ("④ Say why", "“I love it because ______.”"),
    ], cols=2, pageno=12)

    d.bullets("ACTIVITY", "Pair & group work", [
        ("Pair talk (6 min)", "Interview your partner: “What's your favourite season? Why?”"),
        ("Weather report (8 min)", "In groups, present a fun weather forecast for four seasons"),
        ("Writing (8 min)", "Write 4–5 sentences about your favourite season using the frame"),
    ], img=P["summer"], pageno=13)

    d.closing(P["close"], "Every season has its own magic",
              ["Spring brings flowers, summer brings sunshine,",
               "autumn brings colours, and winter brings snow.",
               "Homework: Write a short paragraph about your favourite season with a drawing."],
              "ENGLISH · THE FOUR SEASONS · UNIT 6")

    return d
