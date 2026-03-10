import { supabase } from "@/integrations/supabase/client";

export interface S3UploadResult {
    url: string;
    key: string;
    bucket: string;
}

export const uploadToS3 = async (
    file: File, 
    path: string, 
    onProgress?: (percent: number) => void
): Promise<S3UploadResult> => {
    // 1. Get presigned URL from Edge Function
    const { data, error: functionError } = await supabase.functions.invoke('get-s3-upload-url', {
        body: {
            fileName: file.name,
            fileType: file.type || 'application/octet-stream',
            path: path,
        },
    });

    if (functionError) {
        throw new Error(`Failed to get upload URL: ${functionError.message}`);
    }

    const { signedUrl, key, bucket, region } = data;

    // 2. Upload file to S3 using XHR for progress tracking
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (event) => {
            if (event.lengthComputable && onProgress) {
                const percentComplete = Math.round((event.loaded / event.total) * 100);
                onProgress(percentComplete);
            }
        });

        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                const publicUrl = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
                resolve({
                    url: publicUrl,
                    key: key,
                    bucket: bucket,
                });
            } else {
                console.error("S3 Upload Error Status:", xhr.status, xhr.statusText);
                console.error("S3 Upload Error Response:", xhr.responseText);
                reject(new Error(`Failed to upload to S3: ${xhr.statusText}. Details: ${xhr.responseText}`));
            }
        });

        xhr.addEventListener('error', () => {
            console.error("XHR Network Error");
            reject(new Error("Network error occurred during S3 upload. (Possible firewall/antivirus block)"));
        });

        xhr.addEventListener('abort', () => {
            reject(new Error("S3 upload was aborted."));
        });

        xhr.open('PUT', signedUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
        
        xhr.send(file);
    });
};

export const getS3ViewUrl = async (key: string): Promise<string> => {
    const { data, error } = await supabase.functions.invoke('get-s3-upload-url', {
        body: {
            action: 'view',
            key: key,
        },
    });

    if (error) {
        throw new Error(`Failed to get view URL: ${error.message}`);
    }

    return data.signedUrl;
};
