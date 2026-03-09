import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()
API_BASE_URL = os.getenv("API_BASE_URL")