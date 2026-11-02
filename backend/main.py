from fastapi import FastAPI

app = FastAPI(title="SupportOps AI Backend", description="SupportOps AI works")


@app.get("/")
def greet() -> dict[str, str]:
    return {"message": "hello this is to check "}
