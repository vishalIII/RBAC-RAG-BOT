from fastapi import FastAPI, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from .chat import ask_question_stream

app = FastAPI(title="Python RAG API")


class ChatRequest(BaseModel):
    question: str
    company_id: str
    department_id: str | None = None
    doc_type: str | None = None
    conversation_history: str = ""


@app.get("/")
def home():
    return {
        "message": "Python RAG API Running",
    }


@app.post("/chat")
async def chat(req: ChatRequest):

    try:

        stream = await ask_question_stream(
                question=req.question,
                company_id=req.company_id,
                department_id=req.department_id,
                # document_type=req.doc_type,
                conversation_history=req.conversation_history,
            )

    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail=str(exc),
        ) from exc

    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=str(exc),
        ) from exc

    return StreamingResponse(
        stream,
        media_type="text/event-stream",
    )
