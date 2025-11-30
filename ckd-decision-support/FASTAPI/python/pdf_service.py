from fastapi import FastAPI, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import tempfile
import subprocess
from pathlib import Path
from pypdf import PdfReader
from concurrent.futures import ThreadPoolExecutor, as_completed
import os

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# -----------------------------------------------------------------------
# **/health and /status routes**
# -----------------------------------------------------------------------
@app.get("/health")
def health():
    """
    Lightweight endpoint used for uptime checks.
    Returns 200 OK if the application is running.
    """
    return {"status": "ok"}


@app.get("/status")
def status():
    """
    Returns useful runtime info for debugging and monitoring.
    Does not run OCR or heavy operations.
    """
    return {
        "status": "running",
        "service": "FASTAPI PDF & OCR Processor",
        "version": "1.0.0",
        "environment": "development",  # remember to change to production after deployment
    }


# -----------------------------------------------------------------------
# **Single-run PDF → image conversion (optimized)**
# -----------------------------------------------------------------------
def convert_pdf_to_images(pdf_path: str, dpi: int = 200):
    """
    Runs pdftoppm ONCE to convert all pages of the PDF to JPEGs.
    Returns list of image file paths in correct order.
    """
    output_dir = tempfile.mkdtemp()
    base = os.path.join(output_dir, "page")

    try:
        subprocess.run(
            [
                "pdftoppm",
                "-jpeg",
                "-r", str(dpi),
                pdf_path,
                base
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=40,
            check=True
        )
    except Exception as e:
        print("pdftoppm error:", str(e))
        return []

    # Files will be like: page-1.jpg, page-2.jpg, ...
    image_files = sorted(Path(output_dir).glob("page-*.jpg"), key=lambda p: int(p.stem.split("-")[-1]))
    return [str(p) for p in image_files]

# -----------------------------------------------------------------------
# **Optimized OCR wrapper (parallel-safe)**
# -----------------------------------------------------------------------
def ocr_image(image_path: str, timeout_sec: int = 8) -> str:
    """
    Runs Tesseract OCR on an image with timeout protection.
    """
    try:
        result = subprocess.run(
            ["tesseract", image_path, "stdout"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            timeout=timeout_sec,
            text=True
        )
        text = result.stdout.strip()
        return text if text else "[OCR EMPTY]"
    except subprocess.TimeoutExpired:
        return "[OCR TIMEOUT]"
    except Exception as e:
        return f"[OCR ERROR] {str(e)}"

# -----------------------------------------------------------------------
# **MAIN /extract ROUTE (optimized Option D)**
# -----------------------------------------------------------------------
@app.post("/extract")
async def extract_pdf(file: UploadFile):
    # Validate file
    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="File must be a PDF")

    # Save file to temp
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        tmp.write(await file.read())
        pdf_path = tmp.name

    # Try reading PDF
    try:
        reader = PdfReader(pdf_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF read error: {str(e)}")

    num_pages = len(reader.pages)
    extracted_texts = [""] * num_pages

    # ---------------------------
    # 1) First attempt: text extraction (fast)
    # ---------------------------
    for i, page in enumerate(reader.pages):
        try:
            text = page.extract_text() or ""
            extracted_texts[i] = text.strip()
        except:
            extracted_texts[i] = ""

    # ---------------------------
    # 2) Convert PDF → images in one go (MUCH faster)
    # ---------------------------
    image_paths = convert_pdf_to_images(pdf_path, dpi=200)

    # Match images to page numbers (0-based index)
    page_to_image = {}
    for img_path in image_paths:
        page_num = int(Path(img_path).stem.split("-")[-1]) - 1
        if 0 <= page_num < num_pages:
            page_to_image[page_num] = img_path

    # Determine which pages need OCR
    pages_needing_ocr = [i for i, t in enumerate(extracted_texts) if len(t.strip()) < 20]

    # ---------------------------
    # 3) Run OCR (parallel)
    # ---------------------------
    ocr_used = len(pages_needing_ocr) > 0

    if ocr_used:
        with ThreadPoolExecutor(max_workers=4) as ex:
            futures = {}

            for page_index in pages_needing_ocr:
                img = page_to_image.get(page_index)
                if img:
                    futures[ex.submit(ocr_image, img)] = page_index
                else:
                    extracted_texts[page_index] = "[NO IMAGE AVAILABLE FOR OCR]"

            # Collect OCR results
            for fut in as_completed(futures):
                idx = futures[fut]
                try:
                    extracted_texts[idx] = fut.result()
                except Exception as e:
                    extracted_texts[idx] = f"[OCR FAILED] {str(e)}"

    # ---------------------------
    # 4) Build response
    # ---------------------------
    pages = [
        {"page_number": i + 1, "text": extracted_texts[i]}
        for i in range(num_pages)
    ]

    full_text = "\n\n".join(extracted_texts)

    return {
        "status": "success",
        "page_count": num_pages,
        "ocr_used": ocr_used,
        "pages": pages,
        "full_text": full_text
    }
