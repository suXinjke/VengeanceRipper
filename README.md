# Colony Wars Vegneance Ripper

### This respository hosts several programs to extract resources and convert models from **Colony Wars Vengeance**.

* **game_rsc_extract**: extracts resources from **GAME.RSC** file such as models, textures, mission scripts and more.
* **model_converter**: takes extracted BND models to convert them into [Wavefront .obj](https://en.wikipedia.org/wiki/Wavefront_.obj_file) format.

![Output files](https://i.imgur.com/RF8wsxj.png)

## GAME.RSC Extractor
```
Colony Wars Vengeance GAME.RSC extractor
Extracts GAME.RSC contents

node game_rsc_extract.js <GAME.RSC path> <output_directory>
```

## Colony Wars Vengeance BND Model Converter
```
Colony Wars Vengeance Model Converter
Converts original BND models into OBJ models, with textures extracted
Please keep original file names intact to ensure correct splitting of Level-of-detail models

node model_converter.js [OPTIONS] <bnd_files_directory> <output_directory>

List of options:
    --model-info        Additonal JSON info on original
                          model will be placed alongside
    --no-inverse-axis   Do not invert Y axis
    --no-subdirectories Do not separate output by directories
    --no-textures       Do not output texture data
```