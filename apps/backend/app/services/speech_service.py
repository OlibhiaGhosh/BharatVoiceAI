from io import BytesIO

import httpx

from app.core.config import get_settings


class SpeechService:
    def __init__(self) -> None:
        self.settings = get_settings()

    async def transcribe(self, audio_bytes: bytes | None, transcript_hint: str) -> str:
        if transcript_hint.strip():
            return transcript_hint.strip()
        if not audio_bytes:
            return ""
        if not self.settings.elevenlabs_api_key:
            return "Audio received, but ElevenLabs is not configured. Add the API key or use browser speech recognition."
        headers = {"xi-api-key": self.settings.elevenlabs_api_key}
        files = {"file": ("voice.webm", BytesIO(audio_bytes), "audio/webm")}
        data = {"model_id": "scribe_v1"}
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                self.settings.elevenlabs_stt_url,
                headers=headers,
                data=data,
                files=files,
            )
            response.raise_for_status()
            payload = response.json()
        return payload.get("text", "").strip()
