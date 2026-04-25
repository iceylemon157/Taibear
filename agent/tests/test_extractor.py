from unittest.mock import patch, MagicMock
from tg_bot.llm.extractor import generate_description


def test_generate_description_returns_string():
    mock_response = MagicMock()
    mock_response.text = "充滿工業風格的咖啡廳，適合拍照打卡。甜點精緻，下午茶首選。"

    with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}), \
         patch("tg_bot.llm.extractor.genai") as mock_genai:
        mock_model = MagicMock()
        mock_model.generate_content.return_value = mock_response
        mock_genai.GenerativeModel.return_value = mock_model
        mock_genai.configure = MagicMock()

        result = generate_description(
            store_name="轉運棧咖啡廳",
            domain="美食",
            category="咖啡廳/甜點",
            vibe=["攝影出片"],
            title="台北超美咖啡廳",
            description_text="超好拍的咖啡廳！",
        )

    assert isinstance(result, str)
    assert len(result) > 0


def test_generate_description_returns_none_on_error():
    with patch.dict("os.environ", {"GEMINI_API_KEY": "test-key"}), \
         patch("tg_bot.llm.extractor.genai") as mock_genai:
        mock_genai.configure = MagicMock()
        mock_genai.GenerativeModel.side_effect = Exception("quota exceeded")

        result = generate_description(
            store_name="test",
            domain="美食",
            category="小吃",
            vibe=[],
            title="",
            description_text="",
        )

    assert result is None
