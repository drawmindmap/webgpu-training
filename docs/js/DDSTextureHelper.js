// https://blog.tojicode.com/2011/12/compressed-textures-in-webgl.html
// All values and structures referenced from:
// http://msdn.microsoft.com/en-us/library/bb943991.aspx/
// https://www.khronos.org/opengl/wiki/S3_Texture_Compression
const DDS_MAGIC = 0x20534444;
const DDSD_MIPMAPCOUNT = 0x20000;
const DDPF_FOURCC = 0x4;
const DDSCAPS2_CUBEMAP = 0x200;
const DDSCAPS2_CUBEMAP_POSITIVEX = 0x400;
const DDSCAPS2_CUBEMAP_NEGATIVEX = 0x800;
const DDSCAPS2_CUBEMAP_POSITIVEY = 0x1000;
const DDSCAPS2_CUBEMAP_NEGATIVEY = 0x2000;
const DDSCAPS2_CUBEMAP_POSITIVEZ = 0x4000;
const DDSCAPS2_CUBEMAP_NEGATIVEZ = 0x8000;

function Int32ToFourCC(value) {
  return String.fromCharCode(
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  );
}

const FOURCC_DXT1 = 0x31545844;
const FOURCC_DXT3 = 0x33545844;
const FOURCC_DXT5 = 0x35545844;

const headerLengthInt = 31; // The header length in 32 bit ints

// Offsets into the header array
const offMagic = 0;

const offSize = 1;
const offFlags = 2;
const offHeight = 3;
const offWidth = 4;

const offMipmapCount = 7;

const offPfFlags = 20;
const offPfFourCC = 21;

const offCaps2 = 28;

export default function createBCTexture(device, arrayBuffer, isSRGB) {
  const header = new Int32Array(arrayBuffer, 0, headerLengthInt);
  let blockBytes;
  let format;

  if (header[offMagic] !== DDS_MAGIC) {
    console.error('Invalid magic number in DDS header');
    return 0;
  }

  if (!header[offPfFlags] & DDPF_FOURCC) {
    console.error('Unsupported format, must contain a FourCC code');
    return 0;
  }

  const fourCC = header[offPfFourCC];
  switch (fourCC) {
    case FOURCC_DXT1:
      blockBytes = 8;
      format = 'bc1-rgba-unorm';
      break;

    case FOURCC_DXT3:
      blockBytes = 16;
      format = 'bc2-rgba-unorm';
      break;

    case FOURCC_DXT5:
      blockBytes = 16;
      format = 'bc3-rgba-unorm';
      break;

    default:
      console.error('Unsupported FourCC code:', Int32ToFourCC(fourCC));
      return null;
  }

  if (isSRGB) {
    format += '-srgb';
  }

  let mipmapCount = 1;

  if (header[offFlags] & DDSD_MIPMAPCOUNT) {
    mipmapCount = Math.max(1, header[offMipmapCount]);
  }

  const caps2 = header[offCaps2];
  const isCubemap = !!((caps2 & DDSCAPS2_CUBEMAP));
  if (isCubemap && (
    !(caps2 & DDSCAPS2_CUBEMAP_POSITIVEX)
    || !(caps2 & DDSCAPS2_CUBEMAP_NEGATIVEX)
    || !(caps2 & DDSCAPS2_CUBEMAP_POSITIVEY)
    || !(caps2 & DDSCAPS2_CUBEMAP_NEGATIVEY)
    || !(caps2 & DDSCAPS2_CUBEMAP_POSITIVEZ)
    || !(caps2 & DDSCAPS2_CUBEMAP_NEGATIVEZ)
  )) {
    console.error('Incomplete cubemap faces');
    return null;
  }

  const faces = isCubemap ? 6 : 1;
  const ddsDatas = new Array(faces);
  let dataOffset = header[offSize] + 4;
  for (let face = 0; face < faces; face++) {
    let width = header[offWidth];
    let height = header[offHeight];
    const minmaps = new Array(mipmapCount);
    ddsDatas[face] = minmaps;

    for (let i = 0; i < mipmapCount; ++i) {
      const dataLength = (Math.max(4, width) * Math.max(4, height) * blockBytes) / 4 / 4;
      const byteArray = new Uint8Array(arrayBuffer, dataOffset, dataLength);
      minmaps[i] = {
        level: i,
        format,
        width,
        height,
        data: byteArray,
      };
      dataOffset += dataLength;
      if (width > 1) {
        width *= 0.5;
      }
      if (height > 1) {
        height *= 0.5;
      }
    }
  }
  // console.log(ddsDatas);
  
  const imageSize = {
    width: ddsDatas[0][0].width,
    height: ddsDatas[0][0].height,
    depth: 1,
  };
  const levelCount = ddsDatas[0].length;
  const imageTexture = device.createTexture({
    size: imageSize,
    mipLevelCount: levelCount,
    format: ddsDatas[0][0].format,
    usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.SAMPLED,
  });
  // TODO: reuse buffers?
  // TODO: different width, height: 1024 * 512, 512 * 1024
  const tempBuffers = new Array(levelCount);
  const commandEncoder = device.createCommandEncoder();
  for (let level = 0; level < levelCount; level += 1) {
    const ddsLevel = ddsDatas[0][level];
    // TODO: BC3: 4, BC1: 2
    let bytesPerRow = 4 * ddsLevel.width;
    let ddsLevelData = ddsLevel.data;
    if (bytesPerRow < 256) {
      bytesPerRow = 256;
      const blockCount = Math.ceil(ddsLevel.width / 4);
      const newLength = bytesPerRow * blockCount;
      const ddsLevelDataPadding = new Uint8Array(newLength);
      for (let i = 0; i < blockCount; i += 1) {
        ddsLevelDataPadding.set(new Uint8Array(ddsLevelData.buffer, ddsLevelData.byteOffset + blockCount * 16 * i, blockCount * 16), bytesPerRow * i);
      }
      ddsLevelData = ddsLevelDataPadding;
    }
    const imageBuffer = device.createBuffer({
      size: ddsLevelData.byteLength,
      usage: GPUBufferUsage.COPY_SRC,
      mappedAtCreation: true,
    });
    tempBuffers[level] = imageBuffer;
    new Uint8Array(imageBuffer.getMappedRange()).set(ddsLevelData);
    imageBuffer.unmap();
    commandEncoder.copyBufferToTexture(
      {
        buffer: imageBuffer,
        bytesPerRow,
      },
      {
        texture: imageTexture,
        mipLevel: level,
      },
      {
        width: Math.max(ddsLevel.width, 4),
        height: Math.max(ddsLevel.height, 4),
        depth: 1,
      },
    );
  }
  device.defaultQueue.submit([commandEncoder.finish()]);
  tempBuffers.forEach(buffer => {
    buffer.destroy();
  });
  // TODO: use writeTexture
  // device.defaultQueue.writeTexture(
  //   {
  //     texture: imageTexture,
  //   },
  //   ddsDatas[0][0].data,
  //   {
  //     bytesPerRow: 4 * ddsDatas[0][0].width,
  //   },
  //   imageSize,
  // );

  return imageTexture;
}
