"""
trip_manager/clients/task_manager_client.py — Client stub for the Task Manager service.

The Task Manager is a separate service that owns per-stop task lists.
Trip Manager queries it to check whether all tasks at a stop are done.

Expected contract (to be implemented when task manager is ready):

    GET {TASK_MANAGER_URL}/stops/{stop_id}/completion
    Response:
    {
        "stop_id":     "abc123_stop_1",
        "completed":   true,
        "total_tasks": 3,
        "done_tasks":  3
    }
"""

from __future__ import annotations

from ..config import TASK_MANAGER_URL


class TaskManagerClient:

    def __init__(self, base_url: str = ""):
        self._base_url = base_url or TASK_MANAGER_URL

    def is_stop_completed(self, stop_id: str) -> bool:
        """
        Ask the Task Manager whether all tasks at *stop_id* are done.

        Returns True if every task at the stop is completed.
        Raises NotImplementedError until the task manager service is running.
        """
        raise NotImplementedError(
            f"Task Manager client not yet wired. "
            f"Task Manager URL: {self._base_url}/stops/{stop_id}/completion — "
            f"Implement HTTP call here when the task manager service is ready."
        )

    def get_stop_progress(self, stop_id: str) -> dict:
        """
        Get detailed task progress for a stop.

        Returns: {"stop_id", "completed": bool, "total_tasks": int, "done_tasks": int}
        """
        raise NotImplementedError(
            f"Task Manager client not yet wired. "
            f"Task Manager URL: {self._base_url}/stops/{stop_id}/completion"
        )
