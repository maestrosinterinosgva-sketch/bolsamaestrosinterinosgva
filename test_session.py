import time
import os
from playwright.sync_api import sync_playwright

prof = os.path.expanduser(r'~/.whatsapp_automation_profile')
with sync_playwright() as p:
    ctx = p.chromium.launch_persistent_context(user_data_dir=prof, channel='chrome', headless=True)
    page = ctx.pages[0] if ctx.pages else ctx.new_page()
    page.goto('https://web.whatsapp.com')
    print("PAGE TITLE:", page.title())
    time.sleep(12)
    print("FINAL TITLE:", page.title())
    
    # Check if logged in
    search = page.query_selector('div[contenteditable="true"]')
    print("CONTENTEDITABLE DIVS FOUND:", len(page.query_selector_all('div[contenteditable="true"]')))
    
    # Take screenshot for proof
    shot_path = os.path.join(prof, "session_check.png")
    page.screenshot(path=shot_path)
    print("SCREENSHOT SAVED TO:", shot_path)
    ctx.close()
