import os
from PIL import Image

# Define sprite sheet path and output directories
SPRITE_SHEET_PATH = os.path.join("public", "images", "tokens.png")
OUTPUT_UNITS_DIR = os.path.join("public", "images", "units")
OUTPUT_TOKENS_DIR = os.path.join("public", "images", "tokens")

# Ensure output directories exist
os.makedirs(OUTPUT_UNITS_DIR, exist_ok=True)
os.makedirs(OUTPUT_TOKENS_DIR, exist_ok=True)

try:
    img = Image.open(SPRITE_SHEET_PATH)
    width, height = img.size
    print(f"Loaded sprite sheet: {width}x{height}")
    
    # Grid size (assumed based on previous attempts)
    CELL_WIDTH = 62
    CELL_HEIGHT = 62
    
    # Calculate rows and cols based on image size
    cols = width // CELL_WIDTH
    rows = height // CELL_HEIGHT
    
    print(f"Detected grid: {rows} rows, {cols} columns")

    # Mapping logic:
    # Based on user feedback:
    # Cols 0-5 (0px to -310px) seem to be Tokens/Orders? Or Units?
    # User said: "Agora de fato estrão trocados os tokens com as unidades" when I swapped back.
    # The last "working" state (where user said "some correct some wrong") was likely close.
    # Let's just extract EVERYTHING into indexed files first so we can SEE them.
    # Then we can rename them or just use the index.
    
    # Extraction Loop
    for row in range(rows):
        for col in range(cols):
            x = col * CELL_WIDTH
            y = row * CELL_HEIGHT
            
            # Crop cell
            cell = img.crop((x, y, x + CELL_WIDTH, y + CELL_HEIGHT))
            
            # Save logic
            # We will save as "public/images/extracted/row_X_col_Y.png" temporarily?
            # Or try to map based on our best guess?
            
            # Let's save as generic names first to let the user "see" what is what if needed,
            # OR better yet, just split them all into one folder "sprites" with coordinates in name.
            # actually, let's try to be smart.
            
            # Use `col` to differentiate broadly
            # If col < 6: Group A (Left side)
            # If col >= 6: Group B (Right side)
            
            group = "left" if col < 6 else "right"
            filename = f"sprite_{group}_r{row}_c{col}.png"
            
            cell.save(os.path.join("public", "images", filename))
            print(f"Saved {filename}")

    print("Splitting complete. Please check public/images/ for the extracted files.")

except Exception as e:
    print(f"Error: {e}")
