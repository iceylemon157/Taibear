"""
interface/console/console_ui.py — Interactive console UI for user profile management.

Flow:
    main_menu(service)
    ├── [1] List users
    ├── [2] Create user
    ├── [3] Edit user  → edit_menu(service, user_id)
    │       ├── [1] View profile
    │       ├── [2] Add tag
    │       ├── [3] Remove tag
    │       ├── [4] Add reel
    │       ├── [5] Remove reel
    │       └── [6] Back
    ├── [4] Delete user
    └── [5] Exit
"""

from __future__ import annotations

from service.user_service import SUGGESTED_TAGS, UserService


# ── Helpers ───────────────────────────────────────────────────────────────────

def _hr(char: str = "─", width: int = 52) -> None:
    print(char * width)


def _prompt(msg: str) -> str:
    return input(f"  {msg}: ").strip()


def _pause() -> None:
    input("\n  [Enter 繼續]")


def _print_profile(pref) -> None:
    _hr()
    print(f"  user_id      : {pref.user_id}")
    print(f"  display_name : {pref.display_name}")
    print(f"  selected_tags: {', '.join(pref.selected_tags) or '(none)'}")
    print(f"  reels        : {len(pref.reels)} 筆")
    for i, r in enumerate(pref.reels, 1):
        tags_str = f"  auto_tags={r.auto_tags}" if r.auto_tags else ""
        print(f"    [{i}] {r.url}{tags_str}")
    _hr()


def _pick_tags() -> list[str]:
    """
    Interactive tag picker.
    Shows SUGGESTED_TAGS numbered list; user types numbers + optional free text.
    Returns the final selected tag list.
    """
    print("\n  建議標籤：")
    cols = 3
    for i, tag in enumerate(SUGGESTED_TAGS, 1):
        end = "\n" if i % cols == 0 else "   "
        print(f"  [{i:2}] {tag}", end=end)
    print()
    _hr()
    raw = _prompt("輸入編號（空格分隔），或直接輸入自訂標籤（或兩者混合）").split()

    selected: list[str] = []
    seen: set[str] = set()
    for token in raw:
        if token.isdigit():
            idx = int(token) - 1
            if 0 <= idx < len(SUGGESTED_TAGS):
                tag = SUGGESTED_TAGS[idx]
                if tag not in seen:
                    selected.append(tag)
                    seen.add(tag)
        else:
            if token not in seen:
                selected.append(token)
                seen.add(token)
    return selected


# ── Edit submenu ──────────────────────────────────────────────────────────────

def edit_menu(service: UserService, user_id: str) -> None:
    while True:
        print(f"\n  ── 編輯用戶：{user_id} ──")
        print("  [1] 查看個人資料")
        print("  [2] 新增標籤")
        print("  [3] 刪除標籤")
        print("  [4] 新增 Reel")
        print("  [5] 刪除 Reel")
        print("  [6] 返回主選單")

        choice = _prompt("選擇")

        if choice == "1":
            pref = service.get_user(user_id)
            _print_profile(pref)
            _pause()

        elif choice == "2":
            tags = _pick_tags()
            if not tags:
                print("  未輸入任何標籤。")
            else:
                for tag in tags:
                    try:
                        service.add_tag(user_id, tag)
                        print(f"  ✓ 已新增：{tag}")
                    except ValueError as e:
                        print(f"  ✗ {e}")
            _pause()

        elif choice == "3":
            pref = service.get_user(user_id)
            if not pref.selected_tags:
                print("  此用戶沒有標籤。")
                _pause()
                continue
            print("  現有標籤：")
            for i, t in enumerate(pref.selected_tags, 1):
                print(f"    [{i}] {t}")
            raw = _prompt("輸入要刪除的編號（空格分隔）")
            for token in raw.split():
                if token.isdigit():
                    idx = int(token) - 1
                    if 0 <= idx < len(pref.selected_tags):
                        tag = pref.selected_tags[idx]
                        try:
                            service.remove_tag(user_id, tag)
                            print(f"  ✓ 已刪除：{tag}")
                        except ValueError as e:
                            print(f"  ✗ {e}")
            _pause()

        elif choice == "4":
            url = _prompt("Reel URL")
            text = _prompt("Reel 描述（影片內容 / 字幕摘要）")
            try:
                service.add_reel(user_id, url, text)
                print("  ✓ Reel 已新增。")
            except ValueError as e:
                print(f"  ✗ {e}")
            _pause()

        elif choice == "5":
            pref = service.get_user(user_id)
            if not pref.reels:
                print("  此用戶沒有 Reel。")
                _pause()
                continue
            print("  現有 Reels：")
            for i, r in enumerate(pref.reels, 1):
                print(f"    [{i}] {r.url}")
            raw = _prompt("輸入要刪除的編號（空格分隔）")
            # Collect URLs to delete before mutating
            to_delete = []
            for token in raw.split():
                if token.isdigit():
                    idx = int(token) - 1
                    if 0 <= idx < len(pref.reels):
                        to_delete.append(pref.reels[idx].url)
            for url in to_delete:
                try:
                    service.remove_reel(user_id, url)
                    print(f"  ✓ 已刪除：{url}")
                except ValueError as e:
                    print(f"  ✗ {e}")
            _pause()

        elif choice == "6":
            break

        else:
            print("  無效選項，請重試。")


# ── Main menu ─────────────────────────────────────────────────────────────────

def main_menu(service: UserService) -> None:
    while True:
        print("\n" + "═" * 52)
        print("  用戶偏好管理系統")
        print("═" * 52)
        print("  [1] 列出所有用戶")
        print("  [2] 新增用戶")
        print("  [3] 編輯用戶")
        print("  [4] 刪除用戶")
        print("  [5] 離開")
        print("═" * 52)

        choice = _prompt("選擇")

        if choice == "1":
            users = service.list_users()
            if not users:
                print("  （尚無用戶）")
            else:
                for uid in users:
                    pref = service.get_user(uid)
                    tags_preview = ", ".join(pref.selected_tags[:3])
                    if len(pref.selected_tags) > 3:
                        tags_preview += "…"
                    print(f"  • {uid}  ({pref.display_name})  [{tags_preview}]")
            _pause()

        elif choice == "2":
            user_id = _prompt("user_id（英數字、底線）")
            display_name = _prompt("顯示名稱")
            print("\n  請選擇初始標籤（可留空，稍後再編輯）：")
            tags = _pick_tags()
            try:
                pref = service.create_user(user_id, display_name, tags)
                print(f"  ✓ 用戶 '{pref.user_id}' 已建立。")
            except ValueError as e:
                print(f"  ✗ {e}")
            _pause()

        elif choice == "3":
            users = service.list_users()
            if not users:
                print("  （尚無用戶）")
                _pause()
                continue
            for i, uid in enumerate(users, 1):
                print(f"  [{i}] {uid}")
            raw = _prompt("輸入編號或直接輸入 user_id")
            if raw.isdigit():
                idx = int(raw) - 1
                if 0 <= idx < len(users):
                    user_id = users[idx]
                else:
                    print("  無效編號。")
                    continue
            else:
                user_id = raw
            try:
                service.get_user(user_id)  # existence check
                edit_menu(service, user_id)
            except KeyError as e:
                print(f"  ✗ {e}")
            _pause()

        elif choice == "4":
            users = service.list_users()
            if not users:
                print("  （尚無用戶）")
                _pause()
                continue
            for i, uid in enumerate(users, 1):
                print(f"  [{i}] {uid}")
            raw = _prompt("輸入編號或直接輸入 user_id")
            if raw.isdigit():
                idx = int(raw) - 1
                if 0 <= idx < len(users):
                    user_id = users[idx]
                else:
                    print("  無效編號。")
                    continue
            else:
                user_id = raw
            confirm = _prompt(f"確定刪除 '{user_id}'？（輸入 yes 確認）")
            if confirm.lower() == "yes":
                try:
                    service.delete_user(user_id)
                    print(f"  ✓ 用戶 '{user_id}' 已刪除。")
                except KeyError as e:
                    print(f"  ✗ {e}")
            else:
                print("  取消。")
            _pause()

        elif choice == "5":
            print("  掰掰！")
            break

        else:
            print("  無效選項，請重試。")
