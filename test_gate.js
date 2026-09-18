const testBugReportHistory = [
  { role: "customer", media_type: null, content: "half face dekhao" },
  { role: "ai", media_type: "image", content: "Here are half faces 1" },
  { role: "ai", media_type: "image", content: "Here are half faces 2" },
  { role: "ai", media_type: "image", content: "Here are half faces 3" },
  { role: "ai", media_type: "image", content: "Here are half faces 4" },
  { role: "customer", media_type: null, content: "Eita nibo (reply to img 2)" },
  { role: "ai", media_type: "image", content: "Spark X25 Solid Confirmation" },
  { role: "ai", media_type: null, content: "Is this it?" }
]; // Customer then replies "Eita?"

const testOriginalBugHistory = [
  { role: "customer", media_type: null, content: "helmet dekhao" },
  { role: "ai", media_type: "image", content: "helmet 1" },
  { role: "ai", media_type: "image", content: "helmet 2" },
  { role: "ai", media_type: "image", content: "helmet 3" }
]; // Customer then replies "eita nibo"

function evaluateGate(history) {
  let recentAiImageCount = 0;
  let recentAiSentMultipleImagesArray = false;
  let foundAnyAiMessage = false;

  for (let i = history.length - 1; i >= 0; i--) {
    const msg = history[i];
    if (msg.role === "ai") {
      foundAnyAiMessage = true;
      if (msg.media_type === "image") recentAiImageCount++;
      if ((msg.productImageUrls?.length ?? 0) > 1) recentAiSentMultipleImagesArray = true;
    } else if (msg.role === "customer") {
      if (foundAnyAiMessage) {
        break;
      }
    }
  }

  const recentAiSentMultipleImages = recentAiImageCount > 1 || recentAiSentMultipleImagesArray;
  return { recentAiImageCount, recentAiSentMultipleImages };
}

console.log("=== SCENARIO 1: Bug Report (Confirmation already sent) ===");
const res1 = evaluateGate(testBugReportHistory);
console.log(`AI Image Count in last turn: ${res1.recentAiImageCount}`);
console.log(`Gate Triggered: ${res1.recentAiSentMultipleImages}`);
console.log(`Reason: The last turn only contained 1 image (Spark X25 confirmation). Previous 4-image batch was properly ignored because of the interrupting customer message.`);

console.log("\n=== SCENARIO 2: Original Bug (Ambiguous multi-product) ===");
const res2 = evaluateGate(testOriginalBugHistory);
console.log(`AI Image Count in last turn: ${res2.recentAiImageCount}`);
console.log(`Gate Triggered: ${res2.recentAiSentMultipleImages}`);
console.log(`Reason: The most recent AI turn sent 3 images. No intervening customer messages. Gate correctly detects ambiguity.`);
