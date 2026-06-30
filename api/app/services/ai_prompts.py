from typing import List

def sanitize_input(text: str) -> str:
    """
    Escapes characters that could be used for prompt injection
    by breaking out of quoted strings in the prompt.
    """
    return text.replace('"', '\\"')

def construct_scavenger_hunt_prompt(trip: dict, activity: dict, user_age: int, target_age_group: str) -> str | None:
    location_for_prompt = activity.get('location') or trip.get('location')
    if not location_for_prompt:
        return None

    act_id = activity.get('id')
    if not act_id:
        return None

    name = sanitize_input(activity.get('name', 'this activity'))
    location = sanitize_input(location_for_prompt)
    act_type = sanitize_input(activity.get('activity_type', 'general'))

    activity_details_string = f"Activity to process (ID: {act_id}):\n"
    activity_details_string += f'- Name: "{name}"\n'
    activity_details_string += f'- Location: "{location}"\n'
    activity_details_string += f'- Type: "{act_type}"\n\n'

    output_instructions = f"""
    You MUST return ONLY a single JSON object.
    The top-level key in the JSON object MUST be the activity ID: "{act_id}".

    The exact output format is:

    {{
      "{act_id}": {{
        "challenges": [
          {{"age_group": "{target_age_group}", "text": "Challenge 1"}},
          {{"age_group": "{target_age_group}", "text": "Challenge 2"}},
          {{"age_group": "{target_age_group}", "text": "Challenge 3"}},
          {{"age_group": "{target_age_group}", "text": "Challenge 4"}},
          {{"age_group": "{target_age_group}", "text": "Challenge 5"}}
        ]
      }}
    }}
    """
    
    generation_focus_instruction = f"""
    The user requesting these challenges is {user_age} years old.
    Your main focus is to generate challenges for the '{target_age_group}' age group.
    Make the challenges genuinely appealing, clever, and fun for a {user_age}-year-old.

    --- Special Instructions for Teenagers (14+) ---
    If the target age group is '14-17' or '18+', your goal is to be clever, ironic, or creative. Avoid simple "find the object" tasks.
    Think about the *experience* of the activity.
    Good Example (for an Airport): "Take a photo of the most ridiculously overpriced snack you can find."
    Good Example (for an Airport): "Take an 'album cover' style photo of the departures board."
    Bad Example (Childish): "Take a picture of an airplane."
    ---

    For younger kids (5-7), focus on simple, delightful discoveries.
    """

    return f"""
    You are an expert in designing fun, family-friendly scavenger hunts.

    {generation_focus_instruction}

    Your MOST IMPORTANT task is to ensure that EVERY challenge you generate can be completed by taking a photograph. Users will upload a photo to be scored.

    — CORE RULES —
    - **Every challenge must be a 'find a...' or 'take a picture of...' task.**
    - **Each challenge must result in a single, clear photo.**
    - **Each challenge must be about finding something physical and observable.**

    — CRITICAL: AVOID —
    Do NOT create challenges that involve:
    - **Counting things** (e.g., "Count how many signs you see.")
    - **Abstract or creative invention** (e.g., "Design a flag.")
    - **Performances or actions** (e.g., "Act out your favorite movie.")
    - **Finding text, words, or letters**
    - **Capturing concepts or emotions** (e.g., "Find something happy," "Take a picture of something that symbolizes freedom"). This is a strict rule. The photo must be of a concrete, physical object.

    — CHALLENGE QUALITY EXPECTATIONS —
    You are creating real *challenges*, not just observations. Each one must:
    - Be appropriate for a {user_age}-year-old in the '{target_age_group}' bracket.
    - Get *progressively harder* (e.g., Challenge 5 is harder than Challenge 1).
    - Include **at least one twist**:
      - Specific color, pattern, or shape
      - A physical constraint (e.g., "bigger than your foot")
      - A unique prompt (e.g., "that looks like a face")
      - A situational twist (e.g., "while it's moving", "with a shadow", etc.)

    Use phrasing like:
    - "Take a picture of something…"
    - "Find an object that…"
    - "Capture a moment where…"

    Avoid boring tasks like:
    - "Take a picture of a dog."
    - "Find a tree."

    Instead, make it a challenge:
    - "Find a dog wearing something silly."
    - "Take a picture of a tree with twisted branches."

    — INPUT —
    Here is the activity to generate challenges for:
    {activity_details_string}

    — REQUIRED OUTPUT —
    For the activity ID listed, generate a total of 5 challenges for the '{target_age_group}' age category.
    The challenges should be ordered from easiest to hardest.

    {output_instructions}

    ⚠️ Do not include explanations, commentary, markdown, or extra text — only return the raw JSON object.
    """

def construct_scoring_prompt(challenge_text: str, user_age: int | str) -> str:
    return f"""
    You are an encouraging judge for a family-friendly scavenger hunt.
    The challenge was: "{sanitize_input(challenge_text)}"
    The child who submitted the photo is approximately {user_age} years old.

    Please look at the image and decide whether the challenge was met.
    Then, score the submission from 0 to 10, considering:
    - Creativity
    - Effort (adjusted for age)
    - Accuracy

    Be warm and supportive. If the image doesn't fully meet the challenge, still give kind feedback and highlight what was good.

    Your comment should be short, fun, and encouraging. Here are some examples of the tone we like:
    - "You're on fire! That was a creative twist — challenge unlocked!"
    - "Wow! What a great find! Points awarded!"
    - "So close! I love the effort here. Try to find one that's a little more blue."

    Respond only with a JSON object in this format:
    {{
      "points": X,
      "comment": "Your short, fun, and encouraging sentence."
    }}
    """

def construct_joke_fact_prompt(location: str, user_age: int | str, history_list: List[dict]) -> str:
    exclusion_list = [item['text'] for item in history_list]
    last_item_type = history_list[0]['type'] if history_list else None
    
    type_instruction = "Your job is to provide ONE of the following:\\n- A short, funny, age-appropriate **joke**\\n- OR a surprising, age-appropriate **fun fact**"
    if last_item_type == 'joke':
        type_instruction = "Your job is to provide a surprising, age-appropriate **fun fact**."
    elif last_item_type == 'fact':
        type_instruction = "Your job is to provide a short, funny, age-appropriate **joke**."

    prompt = f"""
    You are a cheerful, kid-friendly assistant in a family vacation app. Your audience is a curious and playful child around {user_age} years old.
    They are currently on a trip to {location} and want something fun!
    
    {type_instruction}

    🎯 Guidelines:
    - Choose **only one**, not both (unless specified).
    - Tailor humor or curiosity to the child's age (e.g., sillier for 5–7, cleverer for 10+).
    - Keep it fresh — avoid clichés.
    - No introductions, no extra lines — just one of the two formats below.
    """
    
    if exclusion_list:
        avoid_prompt = "\\nTo keep things interesting, please do not generate content similar to any of the following:\\n- " + "\\n- ".join(f'"{item}"' for item in exclusion_list)
        prompt += avoid_prompt

    prompt += """
    \\n📜 Format options (use one exactly):
    1. Joke:
    Q: [Question]
    A: [Answer]

    2. Fun fact:
    Did you know? [Fun fact]
    """
    return prompt

def construct_activity_suggestion_prompt(location: str, context: str, user_age: int | str) -> str:
    return f"""
    You are a friendly and age-appropriate activity coach in a family vacation app.

    A {user_age}-year-old is on vacation in {location}, and they said:
    "I'm bored. I'm currently {context}."

    🎯 Your task:
    Suggest ONE simple, fun, and creative activity they can do **right now**, tailored specifically to a {user_age}-year-old.

    ⚠️ Do NOT suggest anything too childish or too advanced for their age.
    🚫 Do NOT suggest scavenger hunts.

    💡 Think about what kids this age enjoy. Here are example activity types by age group:
    - Ages 5–7: drawing animals, silly movement games, spotting shapes, rhyming, telling imaginative stories
    - Ages 8–10: doodling challenges, made-up games, guessing things nearby, cartoon voices, simple photo tasks
    - Ages 11–13: creative challenges, observation games, writing prompts, emoji design, mini competitions
    - Ages 14–17: clever photo ideas, ironic storytelling, fake conspiracy games, creative ranking lists, themed playlists

    ✍️ Format:
    Reply in 1–2 short, fun sentences. End with ONE emoji. Do not include anything else.
    """

def construct_story_prompt(location: str, keywords: List[str], user_age: int | str) -> str:
    sanitized_keywords = [sanitize_input(k) for k in keywords]
    keywords_str = ", ".join(sanitized_keywords)
    
    return f"""
    You are a creative and gentle storyteller for a family vacation app. Your audience is a child around {user_age} years old, currently on a trip to {location}.

    They've requested a bedtime story using the following keywords:
    {keywords_str}

    Your task is to write a short, cozy bedtime story that:
    - Includes the keywords naturally
    - Is set in or inspired by the real-world location of {location}
    - Feels magical, adventurous, or heartwarming — but always age-appropriate for a {user_age}-year-old
    - Has a gentle pace and a calming ending to help the child feel safe, relaxed, and ready to sleep

    Do **not** include scary or intense content.
    Do **not** include introductions, disclaimers, or extra commentary — just tell the story.
    Keep it short: under 300 words.
    """ 