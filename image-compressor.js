// image-compressor.js - Ultra-compresses profile pictures into thumbnail data URLs
export function compressImageToThumbnail(fileOrDataUrl, maxWidth = 64, maxHeight = 64, quality = 0.5) {
    return new Promise((resolve) => {
        if (!fileOrDataUrl) {
            resolve('😀');
            return;
        }

        if (typeof fileOrDataUrl === 'string' && !fileOrDataUrl.startsWith('data:image/') && !fileOrDataUrl.startsWith('http')) {
            resolve(fileOrDataUrl);
            return;
        }

        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            let canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            if (width > height) {
                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }
            } else {
                if (height > maxHeight) {
                    width = Math.round((width * maxHeight) / height);
                    height = maxHeight;
                }
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            let compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve(compressedDataUrl);
        };

        img.onerror = () => {
            resolve('😀');
        };

        if (typeof fileOrDataUrl === 'string') {
            img.src = fileOrDataUrl;
        } else if (fileOrDataUrl instanceof File || fileOrDataUrl instanceof Blob) {
            const reader = new FileReader();
            reader.onload = (e) => { img.src = e.target.result; };
            reader.readAsDataURL(fileOrDataUrl);
        } else {
            resolve('😀');
        }
    });
}