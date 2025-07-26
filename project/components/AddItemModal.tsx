// 2) 上載第一張圖片並寫入 prompt_assets
if (type === 'prompt' && files && files.length > 0) {
  const firstImage = files[0];
  const path = `${user.id}/${insertData.id}-${Date.now()}-${firstImage.name}`;

  const { error: uploadError } = await supabase
    .storage
    .from('prompt-images')
    .upload(path, firstImage, {
      cacheControl: '3600',
      upsert: false,
    });

  if (uploadError) {
    console.error(uploadError);
    toast.error(`圖片上載失敗：${firstImage.name}`);
  } else {
    const { data: pub } = supabase.storage.from('prompt-images').getPublicUrl(path);
    if (pub?.publicUrl) {
      const { error: assetError } = await supabase
        .from('prompt_assets')
        .insert({
          item_id: insertData.id,
          image_url: pub.publicUrl,
        });

      if (assetError) {
        console.error(assetError);
        toast.error('圖片資料儲存失敗');
      }
    }
  }
}
