import os
from PIL import Image, ImageDraw

src_path = r'C:\Users\user\.gemini\antigravity\brain\19681918-da07-4904-8046-a255e72d2783\.user_uploaded\media_1793799807283_fb4b3c11.png'
im = Image.open(src_path).convert('RGBA')

# Target directories
res_icons_dir = r'd:\riff\synth-spotify\res-icons'
os.makedirs(res_icons_dir, exist_ok=True)

# 1. 512x512 app logo (centered transparent)
logo_512 = Image.new('RGBA', (512, 512), (0, 0, 0, 0))
resized = im.resize((500, 500), Image.Resampling.LANCZOS)
logo_512.paste(resized, (6, 6), resized)
logo_512.save(r'd:\riff\synth-spotify\assets\app_logo.png')
logo_512.save(r'd:\riff\synth-spotify\assets\spotify_logo_icon.png')
logo_512.save(r'd:\riff\assets\icon.png')
print('[ICON] Saved 512x512 app_logo.png, spotify_logo_icon.png, assets/icon.png')

# 2. Android ic_launcher_bg.png (432x432, #121212 dark OLED background)
bg_432 = Image.new('RGBA', (432, 432), (18, 18, 18, 255))
bg_432.save(os.path.join(res_icons_dir, 'ic_launcher_bg.png'))
print('[ICON] Saved ic_launcher_bg.png')

# 3. Android adaptive foregrounds: ic_launcher_foreground.png
densities = {
    'mipmap-mdpi': (48, 108),
    'mipmap-hdpi': (72, 162),
    'mipmap-xhdpi': (96, 216),
    'mipmap-xxhdpi': (144, 324),
    'mipmap-xxxhdpi': (192, 432),
}

for folder, (legacy_size, fg_size) in densities.items():
    out_dir = os.path.join(res_icons_dir, folder)
    os.makedirs(out_dir, exist_ok=True)
    
    # Adaptive Foreground (fg_size x fg_size)
    fg_im = Image.new('RGBA', (fg_size, fg_size), (0, 0, 0, 0))
    # Safe zone: scale logo to ~68% of fg_size
    icon_inner_size = int(fg_size * 0.68)
    icon_resized = im.resize((icon_inner_size, icon_inner_size), Image.Resampling.LANCZOS)
    offset = (fg_size - icon_inner_size) // 2
    fg_im.paste(icon_resized, (offset, offset), icon_resized)
    fg_im.save(os.path.join(out_dir, 'ic_launcher_foreground.png'))
    
    # Legacy Square Launcher (legacy_size x legacy_size) with dark rounded background
    leg_im = Image.new('RGBA', (legacy_size, legacy_size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(leg_im)
    radius = int(legacy_size * 0.22)
    draw.rounded_rectangle([0, 0, legacy_size - 1, legacy_size - 1], radius=radius, fill=(18, 18, 18, 255))
    inner_leg = int(legacy_size * 0.72)
    inner_icon = im.resize((inner_leg, inner_leg), Image.Resampling.LANCZOS)
    leg_offset = (legacy_size - inner_leg) // 2
    leg_im.paste(inner_icon, (leg_offset, leg_offset), inner_icon)
    leg_im.save(os.path.join(out_dir, 'ic_launcher.png'))
    
    # Legacy Round Launcher (legacy_size x legacy_size)
    round_im = Image.new('RGBA', (legacy_size, legacy_size), (0, 0, 0, 0))
    draw_round = ImageDraw.Draw(round_im)
    draw_round.ellipse([0, 0, legacy_size - 1, legacy_size - 1], fill=(18, 18, 18, 255))
    round_im.paste(inner_icon, (leg_offset, leg_offset), inner_icon)
    round_im.save(os.path.join(out_dir, 'ic_launcher_round.png'))
    
    print(f'[ICON] Generated {folder} (legacy: {legacy_size}px, fg: {fg_size}px)')

print('[ICON] All application icons successfully generated!')

