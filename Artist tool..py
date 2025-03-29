# Music Promotion Helper - Touchstone 4 Project
# Helps musicians generate hashtags, demographic info, and platform-specific tips

# Dictionary of sample hashtag suggestions by genre
hashtag_data = {
    "hip-hop": ["#HipHop", "#RapLife", "#NewMusic", "#Bars", "#Beats"],
    "pop": ["#PopMusic", "#NowPlaying", "#ViralPop", "#MusicVideo", "#PopStar"],
    "edm": ["#EDM", "#RaveVibes", "#DropTheBeat", "#Electro", "#DanceLife"],
    "rock": ["#RockOn", "#GuitarRiffs", "#AltRock", "#RockLegends", "#LiveLoud"],
    "jazz": ["#JazzVibes", "#SmoothJazz", "#LateNightJazz", "#JazzPiano", "#Saxophone"]
}

# Dictionary of demographics based on genre
demographic_data = {
    "hip-hop": "Ages 16–30, urban listeners, strong Instagram and TikTok engagement.",
    "pop": "Ages 13–28, wide appeal, highly active on Instagram and YouTube.",
    "edm": "Ages 18–28, rave culture, strong TikTok and festival scenes.",
    "rock": "Ages 25–45, more YouTube and Facebook use, often guitar-focused fans.",
    "jazz": "Ages 30–60, prefers Spotify playlists and YouTube for live sessions."
}

# Dictionary of platform tips
platform_tips = {
    "instagram": "Post Reels, stories, and behind-the-scenes content. Use link-in-bio.",
    "tiktok": "Use trending sounds and effects. Post short videos frequently.",
    "youtube": "Create music videos, behind-the-scenes content, and lyric videos."
}

# Function to run the program
def run_music_promo_helper():
    print("🎵 Welcome to the Music Promotion Helper!")
    print("This tool helps you promote your music with hashtags and strategy tips.\n")

    # Get genre input
    genre = input("Enter your music genre (e.g., hip-hop, pop, edm, rock, jazz): ").lower()
    if genre not in hashtag_data:
        print("Sorry, that genre is not currently supported. Please try again later.")
        return

    # Get platform input
    platform = input("Enter your platform (Instagram, TikTok, or YouTube): ").lower()
    if platform not in platform_tips:
        print("Sorry, that platform is not supported. Please choose Instagram, TikTok, or YouTube.")
        return

    # Optional: Get music link
    music_link = input("Enter your music link (optional): ").strip()

    # Output results
    print("\n✅ Here is your promotion plan:\n")

    print("🎯 Top 5 Hashtags for your genre:")
    for tag in hashtag_data[genre]:
        print(f"  {tag}")

    print(f"\n👥 Target Audience for {genre.title()} Music:")
    print(f"  {demographic_data[genre]}")

    print(f"\n📱 {platform.title()} Promotion Tips:")
    print(f"  {platform_tips[platform]}")

    if music_link:
        print(f"\n🔗 Your Music Link:")
        print(f"  {music_link}")
    else:
        print("\n🔗 No music link provided.")

    print("\n✨ Good luck promoting your track!")

# Run the program
run_music_promo_helper()
