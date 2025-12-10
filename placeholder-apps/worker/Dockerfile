FROM python:3.11-alpine

WORKDIR /app

RUN pip install --no-cache-dir flask

COPY worker.py .

EXPOSE 5555

CMD ["python", "worker.py"]
