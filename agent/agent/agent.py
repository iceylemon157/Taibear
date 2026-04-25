from dotenv import load_dotenv

load_dotenv()

from .planner import create_planner_agent

root_agent = create_planner_agent()
