const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const RESULTS_DIR = path.join(__dirname, "..", "..", "..", "..", "benchmark", "results", "ops109");

function generateXlsx() {
  const wb = XLSX.utils.book_new();

  const resultsAoa = [
    ["Pipeline", "Image", "Success", "Total (ms)", "Replicate (ms)", "Replicate Cost ($)", "GPU Secs", "Output Size", "SSIM", "PSNR", "LPIPS", "Face ID", "Scratch", "Human Review"],
    ["pipeline-a", "2.jpeg", "YES", 96263, 14093, 0.0252, 10.973, "4736x3520 (20.6MB)", 0.58, 7.56, "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
    ["pipeline-a", "3.jpeg", "NO (credits)", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
    ["pipeline-a", "4.jpg", "NO (credits)", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
    ["pipeline-a", "5.jpeg", "YES", 83685, 13954, 0.0229, 9.957, "4736x3520 (13.9MB)", 0.58, 7.49, "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
    ["pipeline-a", "6.jpeg", "NO (credits)", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
    ["pipeline-a", "images.jpeg", "NO (credits)", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
    ["pipeline-a", "lahore.jpeg", "YES", 128284, 12054, 0.0199, 8.652, "4736x3520 (20.1MB)", 0.58, 7.64, "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
    ["pipeline-b", "2.jpeg", "YES", 69084, 28891, 0.0613, 3.717, "3072x2304 (4.5MB)", 0.58, 7.62, "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
    ["pipeline-b", "3.jpeg", "YES", 92677, 34742, 0.0719, "UNKNOWN", "2376x1824 (5.6MB)", 0.61, 8.11, "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
    ["pipeline-b", "4.jpg", "YES", 106428, 33999, 0.0707, "UNKNOWN", "3072x2304 (9.7MB)", 0.60, 7.85, "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
    ["pipeline-b", "5.jpeg", "YES", 72772, 34811, 0.0631, "UNKNOWN", "2304x1728 (2.9MB)", 0.58, 7.49, "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
    ["pipeline-b", "6.jpeg", "YES", 68458, 31554, 0.0672, "UNKNOWN", "2304x1728 (2.8MB)", 0.58, 7.62, "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
    ["pipeline-b", "images.jpeg", "NO (credits)", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
    ["pipeline-b", "lahore.jpeg", "NO (credits)", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN", "PLACEHOLDER"],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(resultsAoa);
  XLSX.utils.book_append_sheet(wb, ws1, "Results");

  const pipeA = [resultsAoa[1], resultsAoa[4], resultsAoa[7]]; // 3 successful
  const pipeB = [resultsAoa[8], resultsAoa[9], resultsAoa[10], resultsAoa[11], resultsAoa[12]]; // 5 successful

  const summaryAoa = [
    ["Metric", "Pipeline A (FLUX Restore)", "Pipeline B (Microsoft)"],
    ["Images Completed", "3/7", "5/7"],
    ["Avg Cost/Image", "$0.022667", "$0.066840"],
    ["Avg Total Latency", "106,077ms", "81,884ms"],
    ["Avg Replicate Latency", "13,367ms", "32,799ms"],
    ["Avg SSIM", "0.58", "0.59"],
    ["Avg PSNR", "7.56", "7.74"],
    ["Avg Print Quality", "100.0", "82.0"],
    ["LPIPS", "UNKNOWN", "UNKNOWN"],
    ["Face Identity Score", "UNKNOWN", "UNKNOWN"],
    ["Scratch Removal Score", "UNKNOWN", "UNKNOWN"],
    ["", "", ""],
    ["NOTES", "", ""],
    ["Low credits prevented full 7x2 run", "", ""],
    ["LPIPS requires specialized CV model", "", ""],
    ["Face identity requires face recognition model", "", ""],
    ["Scratch removal requires segmentation model", "", ""],
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(summaryAoa);
  XLSX.utils.book_append_sheet(wb, ws2, "Summary");

  const xlsxPath = path.join(RESULTS_DIR, "comparison.xlsx");
  fs.writeFileSync(xlsxPath, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
  console.log("XLSX: " + xlsxPath);
}

generateXlsx();