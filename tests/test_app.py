from crypto_desk.app import create_app


def test_health():
    response = create_app().test_client().get("/health")
    assert response.status_code == 200
    assert response.get_json()["ok"] is True


def test_invalid_request_is_400():
    response = create_app().test_client().post("/api/analyze", json={})
    assert response.status_code == 400
    assert response.get_json()["ok"] is False


def test_home_renders_form():
    response = create_app().test_client().get("/")
    assert response.status_code == 200
    assert "執行機構級分析".encode("utf-8") in response.data
    assert b'id="watchlist-chips"' in response.data
    assert b'id="watchlist-form"' in response.data
