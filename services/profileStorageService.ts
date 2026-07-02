// BTNG Gold — Profile Photo Storage Service
import { getSupabaseClient } from '@/template';
import { decode } from '@/services/base64Shim';

/**
 * Upload a base64-encoded image to the avatars bucket.
 * Path: avatars/{userId}/profile.jpg
 * Returns the public URL on success.
 */
export async function uploadAvatar(
  userId: string,
  base64Data: string,
): Promise<{ url: string | null; error: string | null }> {
  const client = getSupabaseClient();

  try {
    const arrayBuffer = decode(base64Data);
    const filePath = `${userId}/profile.jpg`;

    const { error: uploadError } = await client.storage
      .from('avatars')
      .upload(filePath, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) return { url: null, error: uploadError.message };

    const { data } = client.storage.from('avatars').getPublicUrl(filePath);
    // Append cache-busting timestamp so updated photos refresh in UI
    const url = `${data.publicUrl}?t=${Date.now()}`;

    return { url, error: null };
  } catch (err: any) {
    return { url: null, error: err?.message ?? 'Upload failed' };
  }
}

/**
 * Delete the stored avatar for a user.
 */
export async function deleteAvatar(userId: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  const { error } = await client.storage
    .from('avatars')
    .remove([`${userId}/profile.jpg`]);
  return { error: error?.message ?? null };
}
