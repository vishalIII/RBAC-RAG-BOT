from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

from .chat import ask_question

app = FastAPI(title="Python RAG API")


class ChatRequest(BaseModel):
    question: str


@app.get("/")
def home():
    return {
        "message": "Python RAG API Running",
    }


@app.post("/chat")
def chat(req: ChatRequest):
    try:
        answer = ask_question(req.question)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    return {
        "success": True,
        "answer": answer,
    }
