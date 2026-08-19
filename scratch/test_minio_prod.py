import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from io import BytesIO
from app.integrations.minio.storage import MinioStorage
from app.core.exceptions import StorageFileNotFoundException


def test_production_minio():
    storage = MinioStorage()

    # 1. Test stream upload
    audio_data = b"production grade audio stream test 123456789"
    key = storage.upload_stream(
        file_obj=BytesIO(audio_data),
        length=len(audio_data),
        storage_key="prod/sample_audio.wav",
        content_type="audio/wav",
        metadata={"employee_id": "EMP001"},
    )
    print("Uploaded Key:", key)

    # 2. Test file existence
    print("File Exists:", storage.file_exists(key))

    # 3. Test download file
    downloaded = storage.download_file(key)
    print("Downloaded bytes match:", downloaded == audio_data)

    # 4. Test presigned URL
    url = storage.get_presigned_url(key)
    print("Presigned URL generated:", url.split("?")[0])

    # 5. Delete file
    storage.delete_file(key)
    print("Exists after delete:", storage.file_exists(key))

    # 6. Test domain exception handling
    try:
        storage.download_file("non_existent_key.wav")
    except StorageFileNotFoundException as e:
        print("Successfully caught domain exception:", e)


if __name__ == "__main__":
    test_production_minio()
