1. Start Qdrant:
   docker run -p 6333:6333 qdrant/qdrant

2. Ingest the PDF into Qdrant:
   npm run python:ingest

3. Start the Python RAG API:
   npm run python:api

4. Optional Node proxy:
   npm run start

Required .env:
   HUGGINGFACEHUB_API_TOKEN=...
   QDRANT_URL=http://localhost:6333

Optional .env:
   QDRANT_COLLECTION=pdf-chatbot
   OLLAMA_MODEL=llama3
   OLLAMA_BASE_URL=http://localhost:11434
   PDF_PATH=src/data/pune_travel_guide_sample.pdf


http://localhost:6333/dashboard#/welcome

To deactivate enviroment:
deactivate
.\.venv\Scripts\Activate