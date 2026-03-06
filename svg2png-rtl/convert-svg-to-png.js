// Usage:
//   node convert-svg-to-png.js input.svg output.png
//   node convert-svg-to-png.js input.svg output.png 150

const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

// Use your Chrome installation
const BROWSER_PATH =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    "C:\\\\Program Files (x86)\\\\Google\\\\Chrome\\\\Application\\\\chrome.exe";

async function getSvgSize(svgContent) {
    const tagMatch = svgContent.match(/<svg[^>]*>/i);
    if (!tagMatch) throw new Error("No <svg> tag found");

    const tag = tagMatch[0];

    const widthMatch = tag.match(/\bwidth="([^"]+)"/i);
    const heightMatch = tag.match(/\bheight="([^"]+)"/i);
    const viewBoxMatch = tag.match(/\bviewBox="([^"]+)"/i);

    let width = null;
    let height = null;

    function parseLength(v) {
        const m = String(v).match(/([0-9.]+)/);
        return m ? parseFloat(m[1]) : null;
    }

    if (widthMatch && heightMatch) {
        width = parseLength(widthMatch[1]);
        height = parseLength(heightMatch[1]);
    } else if (viewBoxMatch) {
        const parts = viewBoxMatch[1].split(/\s+/).map(Number);
        if (parts.length === 4) {
            width = parts[2];
            height = parts[3];
        }
    }

    if (!width || !height) {
        throw new Error("Could not infer width/height from SVG; add width/height or viewBox.");
    }

    return { width, height };
}

async function convertSvgToPng(inputPath, outputPath, dpi = 150) {
    const svgContent = fs.readFileSync(inputPath, "utf8");
    const { width, height } = await getSvgSize(svgContent);

    const baseDpi = 96;
    const scale = dpi / baseDpi;

    const browser = await puppeteer.launch({
        headless: "new",
        executablePath: BROWSER_PATH,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
        const page = await browser.newPage();

        await page.setViewport({
            width: Math.round(width * scale),
            height: Math.round(height * scale),
            deviceScaleFactor: 1,
            // isLandscape: width >= height,
        });

        const html = `
      <!doctype html>
      <html lang="fa" dir="rtl">
      <head>
        <meta charset="utf-8">
        <style>
          html, body {
            margin: 0;
            padding: 0;
            background: transparent;
          }
          body {
            display: flex;
            align-items: flex-start;
            justify-content: flex-start;
          }
          svg {
            width: ${width * scale}px;
            height: ${height * scale}px;
          }
        </style>
      </head>
      <body>
        ${svgContent}
      </body>
      </html>
    `;

        await page.setContent(html, { waitUntil: "networkidle0" });
        await page.waitForSelector("svg");
        const svgElement = await page.$("svg");
        if (!svgElement) throw new Error("SVG element not found.");

        // Get tight bounding box of the SVG content
        const box = await svgElement.boundingBox();
        if (!box) throw new Error("Could not get bounding box of SVG.");

        const buffer = await page.screenshot({
            type: "png",
            omitBackground: true,
            clip: {
                x: Math.round(box.x),
                y: Math.round(box.y),
                width: Math.round(box.width),
                height: Math.round(box.height),
            },
        });

        fs.writeFileSync(outputPath, buffer);
        console.log(`Saved PNG: ${outputPath}`);
    } finally {
        await browser.close();
    }
}

async function main() {
    const [, , inputPath, outputPath, dpiArg] = process.argv;
    if (!inputPath || !outputPath) {
        console.error("Usage: node convert-svg-to-png.js input.svg output.png [dpi]");
        process.exit(1);
    }
    const dpi = dpiArg ? parseInt(dpiArg, 10) : 150;

    if (!fs.existsSync(inputPath)) {
        console.error(`Input file not found: ${inputPath}`);
        process.exit(1);
    }

    await convertSvgToPng(
        path.resolve(inputPath),
        path.resolve(outputPath),
        dpi
    );
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
