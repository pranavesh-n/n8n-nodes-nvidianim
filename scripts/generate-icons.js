const fs = require('fs');
const path = require('path');

// Exact NVIDIA NIM logo matching user uploaded specification:
// #76B900 green rounded square with bold white uppercase 'N'.
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <title>NVIDIA NIM</title>
  <rect width="24" height="24" rx="4.5" fill="#76B900"/>
  <path fill="#FFFFFF" d="M6 5h2.8l6.4 9.6V5H18v14h-2.8L8.8 9.4V19H6V5z"/>
</svg>`;

const targets = [
  'nodes/Nvidianim/nvidia-nim.svg',
  'nodes/Nvidianim/nvidia-nim.dark.svg',
  'nodes/Nvidianim/nvidianim.svg',
  'nodes/Nvidianim/nvidianim.dark.svg',
  'nodes/Nvidianim/nvidia.svg',
  'nodes/Nvidianim/nvidia.dark.svg',
  'nodes/NvidiaNimChatModel/nvidia-nim.svg',
  'nodes/NvidiaNimChatModel/nvidia-nim.dark.svg',
  'nodes/NvidiaNimChatModel/nvidianim.svg',
  'nodes/NvidiaNimChatModel/nvidianim.dark.svg',
  'nodes/NvidiaNimChatModel/nvidia.svg',
  'nodes/NvidiaNimChatModel/nvidia.dark.svg',
  'credentials/nvidia-nim.svg',
  'credentials/nvidia-nim.dark.svg',
  'credentials/nvidianim.svg',
  'credentials/nvidianim.dark.svg',
  'credentials/nvidia.svg',
  'credentials/nvidia.dark.svg',
];

const root = path.resolve(__dirname, '..');

for (const relPath of targets) {
  const fullPath = path.join(root, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, svgContent, 'utf8');

  // Also update in dist/ if dist exists
  const distPath = path.join(root, 'dist', relPath);
  if (fs.existsSync(path.dirname(distPath))) {
    fs.writeFileSync(distPath, svgContent, 'utf8');
  }
}

// Also sync PNG icons
const userPngPath = 'C:/Users/Pranavesh/.gemini/antigravity-cli/brain/e847c214-1c03-49b3-8310-b9d6a0e6aff8/.user_uploaded/uploaded_media_1793438186298.png';
if (fs.existsSync(userPngPath)) {
  const pngTargets = [
    'nodes/Nvidianim/nvidia-nim.png',
    'nodes/Nvidianim/nvidianim.png',
    'nodes/NvidiaNimChatModel/nvidia-nim.png',
    'nodes/NvidiaNimChatModel/nvidianim.png',
    'credentials/nvidia-nim.png',
    'credentials/nvidianim.png',
  ];
  for (const rel of pngTargets) {
    const dest = path.join(root, rel);
    fs.copyFileSync(userPngPath, dest);
    const distDest = path.join(root, 'dist', rel);
    if (fs.existsSync(path.dirname(distDest))) {
      fs.copyFileSync(userPngPath, distDest);
    }
  }
}

console.log('Successfully generated all NVIDIA NIM icons.');
