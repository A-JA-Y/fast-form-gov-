const templates = {
  railway: {
    photo: { w: 200, h: 230, format: "png" },
    sign: { w: 150, h: 50, format: "png" },
  },
  bank: {
    photo: { w: 140, h: 160, format: "jpeg" },
    sign: { w: 120, h: 60, format: "jpeg" },
  },
  bpsc: {
    photo: { w: 150, h: 180, format: "png" },
    sign: { w: 120, h: 60, format: "png" },
  },
  sscexams: {
    photo: { w: 200, h: 240, format: "jpeg" },
    sign: { w: 240, h: 80, format: "png" },
  },
};

const templateSel = document.getElementById("template");
const customBox = document.getElementById("customBox");
const customW = document.getElementById("customW");
const customH = document.getElementById("customH");
const photoFile = document.getElementById("photoFile");
const signFile = document.getElementById("signFile");
const idFile = document.getElementById("idFile");
const processBtn = document.getElementById("processBtn");
const downloadBtn = document.getElementById("downloadBtn");
const statusEl = document.getElementById("status");

// Store processed files
let processedFiles = {
  photo: null,
  sign: null,
  id: null,
};

// Preview elements
const previewEmptyState = document.getElementById("previewEmptyState");
const photoPreview = document.getElementById("photoPreview");
const signPreview = document.getElementById("signPreview");
const idPreview = document.getElementById("idPreview");
const photoPreviewImage = document.getElementById("photoPreviewImage");
const signPreviewImage = document.getElementById("signPreviewImage");
const idPreviewImage = document.getElementById("idPreviewImage");

// Merge files UI
const mergeFilesInput = document.getElementById("mergeFiles");
const mergeListEl = document.getElementById("mergeList");
const mergeBtn = document.getElementById("mergeBtn");
const mergeStatus = document.getElementById("mergeStatus");
const mergeItems = [];

const viewPhotoBtn = document.getElementById("viewPhotoBtn");
const viewSignBtn = document.getElementById("viewSignBtn");
const viewIdBtn = document.getElementById("viewIdBtn");
const viewerModal = document.getElementById("viewerModal");
const viewerBody = document.getElementById("viewerBody");
const closeViewerBtn = document.getElementById("closeViewerBtn");

templateSel.addEventListener("change", () => {
  customBox.style.display = templateSel.value === "custom" ? "block" : "none";
});

// Helper function to format file size
function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + " " + sizes[i];
}

// Update preview visibility based on file selections
function updatePreviewVisibility() {
  const hasPhoto = photoFile.files[0];
  const hasSign = signFile.files[0];
  const hasId = idFile.files[0];

  photoPreview.style.display = hasPhoto ? "block" : "none";
  signPreview.style.display = hasSign ? "block" : "none";
  idPreview.style.display = hasId ? "block" : "none";

  if (hasPhoto || hasSign || hasId) {
    previewEmptyState.style.display = "none";
  } else {
    previewEmptyState.style.display = "block";
  }
}

function openViewer(file, title = "Document Preview") {
  if (!file) {
    return;
  }

  viewerBody.innerHTML = "";
  document.getElementById("viewerTitle").textContent = title;

  if (file.type.startsWith("image/")) {
    const imgEl = document.createElement("img");
    imgEl.src = URL.createObjectURL(file);
    imgEl.alt = file.name;
    imgEl.onload = () => URL.revokeObjectURL(imgEl.src);
    viewerBody.appendChild(imgEl);
  } else if (
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf")
  ) {
    const objectEl = document.createElement("object");
    objectEl.data = URL.createObjectURL(file);
    objectEl.type = "application/pdf";
    objectEl.width = "100%";
    objectEl.height = "100%";
    objectEl.innerHTML =
      '<p>Preview not available. <a target="_blank" href="' +
      objectEl.data +
      '">Open in new tab</a></p>';
    viewerBody.appendChild(objectEl);
  } else if (
    file.type.startsWith("text/") ||
    file.name.match(/\.(txt|md|csv)$/i)
  ) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const pre = document.createElement("pre");
      pre.textContent = e.target.result;
      pre.style.whiteSpace = "pre-wrap";
      viewerBody.appendChild(pre);
    };
    reader.readAsText(file);
  } else {
    const p = document.createElement("p");
    p.textContent = `Preview not supported for file type "${file.type || "unknown"}". Use download to verify.`;
    viewerBody.appendChild(p);
  }

  viewerModal.classList.add("active");
}

function closeViewer() {
  const objects = viewerBody.querySelectorAll("object, img, iframe");
  objects.forEach((node) => {
    if (
      node.tagName === "IMG" ||
      node.tagName === "OBJECT" ||
      node.tagName === "IFRAME"
    ) {
      URL.revokeObjectURL(node.src || node.data);
    }
  });
  viewerBody.innerHTML = "";
  viewerModal.classList.remove("active");
}

closeViewerBtn.addEventListener("click", closeViewer);
viewerModal.addEventListener("click", (evt) => {
  if (evt.target === viewerModal) {
    closeViewer();
  }
});

viewPhotoBtn.addEventListener("click", () =>
  openViewer(photoFile.files[0], "Photo Preview"),
);
viewSignBtn.addEventListener("click", () =>
  openViewer(signFile.files[0], "Signature Preview"),
);
viewIdBtn.addEventListener("click", () =>
  openViewer(idFile.files[0], "ID Preview"),
);

// Merge list helpers
function setMergeStatus(text, color = "green") {
  mergeStatus.style.color = color;
  mergeStatus.innerText = text;
}

function renderMergeList() {
  mergeListEl.innerHTML = "";

  if (!mergeItems.length) {
    mergeListEl.innerHTML =
      '<p class="merge-empty">No files selected. Add files to start merging.</p>';
    mergeBtn.disabled = true;
    return;
  }

  mergeItems.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "merge-item";

    const name = document.createElement("span");
    name.textContent = item.file.name;
    row.appendChild(name);

    const up = document.createElement("button");
    up.textContent = "↑";
    up.title = "Move up";
    up.disabled = index === 0;
    up.addEventListener("click", () => {
      if (index === 0) return;
      const tmp = mergeItems[index - 1];
      mergeItems[index - 1] = mergeItems[index];
      mergeItems[index] = tmp;
      renderMergeList();
    });
    row.appendChild(up);

    const down = document.createElement("button");
    down.textContent = "↓";
    down.title = "Move down";
    down.disabled = index === mergeItems.length - 1;
    down.addEventListener("click", () => {
      if (index === mergeItems.length - 1) return;
      const tmp = mergeItems[index + 1];
      mergeItems[index + 1] = mergeItems[index];
      mergeItems[index] = tmp;
      renderMergeList();
    });
    row.appendChild(down);

    const viewBtn = document.createElement("button");
    viewBtn.textContent = "👁";
    viewBtn.className = "icon-button";
    viewBtn.title = "View file";
    viewBtn.addEventListener("click", () => {
      openViewer(item.file, `Merge item: ${item.file.name}`);
    });
    row.appendChild(viewBtn);

    const remove = document.createElement("button");
    remove.textContent = "✕";
    remove.title = "Remove";
    remove.addEventListener("click", () => {
      mergeItems.splice(index, 1);
      renderMergeList();
    });
    row.appendChild(remove);

    mergeListEl.appendChild(row);
  });

  mergeBtn.disabled = false;
}

mergeFilesInput.addEventListener("change", () => {
  const files = Array.from(mergeFilesInput.files || []);
  files.forEach((file) => {
    mergeItems.push({ file });
  });
  renderMergeList();
  setMergeStatus("Ready to merge", "green");
});

// Helper function to convert WebP to PNG using Canvas
async function convertWebPToPNG(file) {
  const dataUrl = await new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });

  const img = await new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob(resolve, "image/png");
  });
}

async function mergeFilesToPdf(items) {
  const mergedPdf = await PDFLib.PDFDocument.create();

  for (const item of items) {
    const file = item.file;

    if (
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf")
    ) {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFLib.PDFDocument.load(arrayBuffer);
      const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      copiedPages.forEach((page) => {
        mergedPdf.addPage(page);
      });
    } else if (
      file.type.startsWith("image/") ||
      /\.(png|jpe?g|webp)$/i.test(file.name)
    ) {
      try {
        const imageBytes = await file.arrayBuffer();
        let img;
        if (
          file.type === "image/png" ||
          file.name.toLowerCase().endsWith(".png")
        ) {
          img = await mergedPdf.embedPng(imageBytes);
        } else if (
          file.type === "image/webp" ||
          file.name.toLowerCase().endsWith(".webp")
        ) {
          // Convert WebP to PNG first
          const pngBlob = await convertWebPToPNG(file);
          const pngBytes = await pngBlob.arrayBuffer();
          img = await mergedPdf.embedPng(pngBytes);
        } else {
          // Assume JPEG
          img = await mergedPdf.embedJpg(imageBytes);
        }

        const { width, height } = img.scale(1);
        const page = mergedPdf.addPage([width, height]);
        page.drawImage(img, {
          x: 0,
          y: 0,
          width,
          height,
        });
      } catch (err) {
        throw new Error(`Failed to embed image ${file.name}: ${err.message}`);
      }
    } else {
      // Unsupported file type - ignore
    }
  }

  const mergedBytes = await mergedPdf.save();
  return new File([mergedBytes], `merged_${Date.now()}.pdf`, {
    type: "application/pdf",
  });
}

mergeBtn.addEventListener("click", async () => {
  try {
    if (!mergeItems.length) {
      setMergeStatus("Add files to merge first", "crimson");
      return;
    }

    setMergeStatus("Merging files...", "blue");
    mergeBtn.disabled = true;

    const mergedFile = await mergeFilesToPdf(mergeItems);
    downloadFile(mergedFile);

    setMergeStatus("Merged PDF downloaded", "green");
  } catch (err) {
    console.error(err);
    setMergeStatus("Error merging files: " + err.message, "crimson");
  } finally {
    mergeBtn.disabled = false;
  }
});

// Update photo preview
photoFile.addEventListener("change", () => {
  viewPhotoBtn.disabled = !photoFile.files.length;

  if (photoFile.files[0]) {
    const file = photoFile.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      photoPreviewImage.innerHTML = `<img src="${e.target.result}" alt="Photo preview">`;
      photoPreviewImage.classList.remove("empty");
    };
    reader.readAsDataURL(file);

    // Display original size
    document.getElementById("photoSizeBefore").textContent = formatFileSize(
      file.size,
    );
    document.getElementById("photoSizeAfter").textContent = "—";
    document.getElementById("photoReduction").style.display = "none";
  }
  updatePreviewVisibility();
});

// Update signature preview
signFile.addEventListener("change", () => {
  viewSignBtn.disabled = !signFile.files.length;

  if (signFile.files[0]) {
    const file = signFile.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      signPreviewImage.innerHTML = `<img src="${e.target.result}" alt="Signature preview">`;
      signPreviewImage.classList.remove("empty");
    };
    reader.readAsDataURL(file);

    // Display original size
    document.getElementById("signSizeBefore").textContent = formatFileSize(
      file.size,
    );
    document.getElementById("signSizeAfter").textContent = "—";
    document.getElementById("signReduction").style.display = "none";
  }
  updatePreviewVisibility();
});

// Update ID preview
idFile.addEventListener("change", () => {
  viewIdBtn.disabled = !idFile.files.length;

  if (idFile.files[0]) {
    const file = idFile.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      if (file.type.startsWith("image/")) {
        idPreviewImage.innerHTML = `<img src="${e.target.result}" alt="ID preview">`;
        idPreviewImage.classList.remove("empty");
      } else {
        idPreviewImage.innerHTML = `<span>📄 ${file.name}</span>`;
      }
    };
    reader.readAsDataURL(file);

    // Display file size
    document.getElementById("idSize").textContent = formatFileSize(file.size);
  }
  updatePreviewVisibility();
});

function status(text, color = "green") {
  statusEl.style.color = color;
  statusEl.innerText = text;
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function processImage(file, targetW, targetH, format) {
  const dataUrl = await new Promise((res) => {
    const r = new FileReader();
    r.onload = (e) => res(e.target.result);
    r.readAsDataURL(file);
  });

  const img = await new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, targetW, targetH);

  /* CROP MODE (NO DISTORTION) */
  const scale = Math.max(
    targetW / img.naturalWidth,
    targetH / img.naturalHeight,
  );
  const newW = img.naturalWidth * scale;
  const newH = img.naturalHeight * scale;
  const dx = (targetW - newW) / 2;
  const dy = (targetH - newH) / 2;

  ctx.drawImage(img, dx, dy, newW, newH);

  const mime = format === "png" ? "image/png" : "image/jpeg";
  const blob = await new Promise((res) => canvas.toBlob(res, mime, 0.9));
  const ext = format === "png" ? "png" : format === "jpg" ? "jpg" : "jpeg";
  return { canvas, blob, ext, mime };
}

// Function to convert canvas to PDF
async function canvasToPDF(canvas, filename) {
  return new Promise((resolve, reject) => {
    try {
      // Wait for jsPDF to be available
      let attempts = 0;
      const checkJsPDF = () => {
        if (window.jspdf && window.jspdf.jsPDF) {
          const jsPDF = window.jspdf.jsPDF;
          const imgData = canvas.toDataURL("image/jpeg", 0.95);
          const width = canvas.width;
          const height = canvas.height;

          // Create PDF with custom dimensions (in mm at 96 DPI)
          const mmWidth = (width / 96) * 25.4;
          const mmHeight = (height / 96) * 25.4;

          try {
            const pdf = new jsPDF({
              orientation: width > height ? "l" : "p",
              unit: "mm",
              format: [mmWidth, mmHeight],
            });

            pdf.addImage(imgData, "JPEG", 0, 0, mmWidth, mmHeight);

            // Get PDF as blob (synchronous in jsPDF UMD)
            const pdfBlob = pdf.output("blob");
            const file = new File([pdfBlob], filename, {
              type: "application/pdf",
            });
            resolve(file);
          } catch (err) {
            reject(new Error("PDF generation error: " + err.message));
          }
        } else if (attempts > 100) {
          reject(new Error("jsPDF not loaded after waiting"));
        } else {
          attempts++;
          setTimeout(checkJsPDF, 50);
        }
      };
      checkJsPDF();
    } catch (err) {
      reject(err);
    }
  });
}

function updateSizeReduction(
  beforeSize,
  afterSize,
  elementId,
  reduceElementId,
) {
  const reduction = beforeSize - afterSize;
  const percentage = ((reduction / beforeSize) * 100).toFixed(1);
  const reduceEl = document.getElementById(reduceElementId);

  if (percentage > 0) {
    reduceEl.textContent = `✓ Reduced by ${percentage}% (${formatFileSize(reduction)} saved)`;
    reduceEl.classList.remove("negative");
    reduceEl.style.display = "block";
  } else if (percentage < 0) {
    reduceEl.textContent = `Increased by ${Math.abs(percentage)}% (${formatFileSize(Math.abs(reduction))} added)`;
    reduceEl.classList.add("negative");
    reduceEl.style.display = "block";
  } else {
    reduceEl.style.display = "none";
  }
}

// Process button listener
processBtn.addEventListener("click", async () => {
  try {
    if (!templateSel.value) {
      status("Select template", "crimson");
      return;
    }

    if (!photoFile.files[0] || !signFile.files[0]) {
      status("Upload photo & signature", "crimson");
      return;
    }

    let photoSpec, signSpec;

    if (templateSel.value === "custom") {
      const w = parseInt(customW.value);
      const h = parseInt(customH.value);
      photoSpec = { w, h, format: "jpeg" };
      signSpec = {
        w: Math.round(w * 0.6),
        h: Math.round(h * 0.3),
        format: "png",
      };
    } else {
      photoSpec = { ...templates[templateSel.value].photo };
      signSpec = { ...templates[templateSel.value].sign };
    }

    status("Processing...", "blue");

    const photoFormatSelect = document.getElementById("photoFormat").value;
    const processedPhotoData = await processImage(
      photoFile.files[0],
      photoSpec.w,
      photoSpec.h,
      photoFormatSelect === "pdf" ? "jpeg" : photoFormatSelect,
    );

    let processedPhoto;
    if (photoFormatSelect === "pdf") {
      processedPhoto = await canvasToPDF(
        processedPhotoData.canvas,
        `image_${photoSpec.w}x${photoSpec.h}.pdf`,
      );
    } else {
      processedPhoto = new File(
        [processedPhotoData.blob],
        `image_${photoSpec.w}x${photoSpec.h}.${processedPhotoData.ext}`,
        { type: processedPhotoData.mime },
      );
    }

    const processedSignData = await processImage(
      signFile.files[0],
      signSpec.w,
      signSpec.h,
      signSpec.format,
    );

    const signFormatSelect = document.getElementById("signFormat").value;
    let processedSign;
    if (signFormatSelect === "pdf") {
      processedSign = await canvasToPDF(
        processedSignData.canvas,
        `signature_${signSpec.w}x${signSpec.h}.pdf`,
      );
    } else {
      processedSign = new File(
        [processedSignData.blob],
        `signature_${signSpec.w}x${signSpec.h}.${signFormatSelect === "jpg" ? "jpg" : signFormatSelect}`,
        { type: signFormatSelect === "png" ? "image/png" : "image/jpeg" },
      );
    }

    // Handle ID file format conversion if selected
    let processedIdFile = null;
    if (idFile.files[0]) {
      const idFormatSelect = document.getElementById("idFormat").value;
      if (
        idFormatSelect === "pdf" &&
        idFile.files[0].type.startsWith("image/")
      ) {
        // Convert image ID to PDF
        const tempCanvas = document.createElement("canvas");
        const tempImg = new Image();
        tempImg.src = URL.createObjectURL(idFile.files[0]);
        await new Promise((res) => (tempImg.onload = res));

        tempCanvas.width = tempImg.naturalWidth;
        tempCanvas.height = tempImg.naturalHeight;
        const tempCtx = tempCanvas.getContext("2d");
        tempCtx.drawImage(tempImg, 0, 0);

        processedIdFile = await canvasToPDF(tempCanvas, `id_document.pdf`);
      } else {
        processedIdFile = idFile.files[0];
      }
    }

    // Store processed files
    processedFiles.photo = processedPhoto;
    processedFiles.sign = processedSign;
    processedFiles.id = processedIdFile;

    // Update preview with processed file sizes
    const photoBefore = photoFile.files[0].size;
    const photoAfter = processedPhoto.size;
    document.getElementById("photoSizeAfter").textContent =
      formatFileSize(photoAfter);
    updateSizeReduction(
      photoBefore,
      photoAfter,
      "photoSizeBefore",
      "photoReduction",
    );

    const signBefore = signFile.files[0].size;
    const signAfter = processedSign.size;
    document.getElementById("signSizeAfter").textContent =
      formatFileSize(signAfter);
    updateSizeReduction(
      signBefore,
      signAfter,
      "signSizeBefore",
      "signReduction",
    );

    // Enable download button
    downloadBtn.disabled = false;
    downloadBtn.style.opacity = "1";
    downloadBtn.style.cursor = "pointer";

    status("Processing complete! Ready to download.");
  } catch (err) {
    console.error(err);
    status("Error: " + err.message, "crimson");
  }
});

// Download button listener
downloadBtn.addEventListener("click", () => {
  try {
    if (processedFiles.photo) {
      downloadFile(processedFiles.photo);
    }
    if (processedFiles.sign) {
      downloadFile(processedFiles.sign);
    }
    if (processedFiles.id) {
      downloadFile(processedFiles.id);
    }
    status("Files downloaded successfully");
  } catch (err) {
    console.error(err);
    status("Error: " + err.message, "crimson");
  }
});
