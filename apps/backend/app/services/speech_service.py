class SpeechService:
    async def transcribe(self, transcript_hint: str) -> str:
        return transcript_hint.strip()
