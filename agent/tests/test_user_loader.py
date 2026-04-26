from unittest.mock import MagicMock, patch
from db.user_loader import load_preference_from_db


def _make_place(store_name, vibe, description):
    p = MagicMock()
    p.store_name = store_name
    p.vibe = vibe
    p.description = description
    return p


def _make_item(url, places):
    i = MagicMock()
    i.url = url
    i.item_places = [MagicMock(place=p) for p in places]
    return i


def test_load_preference_builds_user_preference():
    place1 = _make_place("小籠包王", ["朋友聚會", "攝影出片"], "道地台灣小吃，必訪！")
    place2 = _make_place("大安森林公園", ["散步放鬆"], "台北市中心綠洲，適合慢跑。")
    item1 = _make_item("https://ig.com/reel/abc", [place1])
    item2 = _make_item("https://ig.com/reel/def", [place2])

    mock_user = MagicMock()
    mock_user.username = "testuser"
    mock_user.items = [item1, item2]

    mock_session = MagicMock()
    mock_session.__enter__ = MagicMock(return_value=mock_session)
    mock_session.__exit__ = MagicMock(return_value=False)
    mock_session.get.return_value = mock_user

    with patch("db.user_loader.get_session", return_value=MagicMock(return_value=mock_session)):
        pref = load_preference_from_db(12345)

    assert pref.user_id == "12345"
    assert pref.display_name == "testuser"
    assert "朋友聚會" in pref.selected_tags
    assert "散步放鬆" in pref.selected_tags
    assert len(pref.reels) == 2
    assert pref.reels[0].url == "https://ig.com/reel/abc"
    assert "道地台灣小吃" in pref.reels[0].text_content
    assert "朋友聚會" in pref.reels[0].auto_tags


def test_load_preference_returns_empty_if_user_not_found():
    mock_session = MagicMock()
    mock_session.__enter__ = MagicMock(return_value=mock_session)
    mock_session.__exit__ = MagicMock(return_value=False)
    mock_session.get.return_value = None

    with patch("db.user_loader.get_session", return_value=MagicMock(return_value=mock_session)):
        pref = load_preference_from_db(99999)

    assert pref.user_id == ""
    assert pref.selected_tags == []
    assert pref.reels == []
