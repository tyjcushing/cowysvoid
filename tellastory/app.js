pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js';

const PDF_PATH = './TellAStoryVol1.pdf';

let pdfDocument;
let totalCards;

let currentFront = null;
let currentBack = null;
let showingFront = true;

const loadingElement = document.getElementById('loading');
const cardContainer = document.getElementById('cardContainer');
const cardImage = document.getElementById('cardImage');

async function renderPage(pageNumber) {
    const page = await pdfDocument.getPage(pageNumber);

    const viewport = page.getViewport({
        scale: 2
    });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');

    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
        canvasContext: context,
        viewport: viewport
    }).promise;

    return canvas.toDataURL('image/png');
}

async function drawRandomCard() {
    const randomCardIndex =
        Math.floor(Math.random() * totalCards);

    const frontPage =
        (randomCardIndex * 2) + 1;

    const backPage =
        frontPage + 1;

    currentFront = await renderPage(frontPage);

    if (backPage <= pdfDocument.numPages) {
        currentBack = await renderPage(backPage);
    } else {
        currentBack = null;
    }

    showingFront = true;
    cardImage.src = currentFront;
}

function flipCard() {
    if (!currentBack) {
        return;
    }

    showingFront = !showingFront;

    cardImage.src =
        showingFront
            ? currentFront
            : currentBack;
}

async function initialize() {
    pdfDocument =
        await pdfjsLib.getDocument(PDF_PATH).promise;

    totalCards =
        Math.floor(pdfDocument.numPages / 2);

    loadingElement.classList.add('hidden');
    cardContainer.classList.remove('hidden');

    await drawRandomCard();
}

document
    .getElementById('flipBtn')
    .addEventListener('click', flipCard);

document
    .getElementById('newBtn')
    .addEventListener('click', drawRandomCard);

cardImage.addEventListener('click', flipCard);

initialize();