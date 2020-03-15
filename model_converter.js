const fs = require( 'fs' ).promises
const path = require( 'path' )
const { parseTIM, parsedTimToPngBuffer } = require( './tim' )

function formatPointer( num = 0 ) {
    return '0x' + num.toString( 16 ).padStart( 8, '0' )
}

function parseVertex( FILE = Buffer.alloc( 0 ), offset = 0 ) {
    return {
        x: FILE.readInt16LE( offset + 0x0 ),
        y: FILE.readInt16LE( offset + 0x2 ),
        z: FILE.readInt16LE( offset + 0x4 )
    }
}

function parseFace( params = {
    FILE: Buffer.alloc( 0 ),
    offset: 0,
    vertex_amount: 3,
    uv_start: 0,
    texture_ptr: 0
} ) {
    const {
        FILE,
        offset,
        vertex_amount,
        uv_start,
        texture_ptr
    } = params

    return {
        vertexes: [ ... new Array( vertex_amount ) ]
            .map( ( _, index ) => FILE.readInt16LE( offset + 0x2 * index ) ),

        uv: [ ... new Array( vertex_amount ) ]
            .map( ( _, index ) => {
                return {
                    x: FILE.readUInt8( offset + uv_start + 0x0 + index * 0x2 ),
                    y: FILE.readUInt8( offset + uv_start + 0x1 + index * 0x2 )
                }
            } ),

        texture_index: FILE.readUInt8( offset + texture_ptr )
    }
}

function parseTMD( TMD = Buffer.alloc( 0 ), file_offset = 0 ) {
    const vertex_offset = TMD.readUInt32LE( 0 )
    const vertex_amount = TMD.readUInt32LE( 4 )

    const vertexes = [ ... new Array( vertex_amount ) ]
        .map( ( _, index ) => ( {
            index,
            file_ptr: formatPointer( file_offset + vertex_offset + index * 8 ),
            ...parseVertex( TMD, vertex_offset + index * 8 )
        } ) )

    const face_sections = [ ... new Array( 4 ) ]
        .map( ( _, index ) => ( {
            index,
            amount: TMD.readUInt32LE( 0x1C + index * 4 ),
            offset: TMD.readUInt32LE( 0x44 + index * 4 ),
            file_ptr: formatPointer( file_offset + TMD.readUInt32LE( 0x44 + index * 4 ) )
        } ) )
        .filter( ( { amount } ) => amount > 0 )

    const faces = []
    for ( const face_section of face_sections ) {
        for ( let index = 0 ; index < face_section.amount ; index++ ) {
            const face_section_meta = {
                0: { vertex_amount: 3, uv_start: 0x0C, texture_ptr: 0x0A, size: 0x14 },
                1: { vertex_amount: 4, uv_start: 0x10, texture_ptr: 0x0E, size: 0x18 },
                2: { vertex_amount: 3, uv_start: 0x10, texture_ptr: 0x0E, size: 0x18 },
                3: { vertex_amount: 4, uv_start: 0x14, texture_ptr: 0x12, size: 0x20 }
            }

            const meta = face_section_meta[face_section.index]
            if ( !meta ) {
                throw new Error( `Unknown face section meta, index ${face_section.index}` )
            }

            const face_offset = face_section.offset + index * meta.size

            const face = parseFace( {
                FILE: TMD,
                offset: face_offset,
                ...meta
            } )

            faces.push( {
                file_ptr: formatPointer( file_offset + face_offset ),
                ...face
            } )
        }
    }

    return {
        vertexes_file_ptr: formatPointer( file_offset + vertex_offset ),
        vertex_amount,
        face_sections,

        vertexes,
        faces
    }
}

function parseModel( FILE = Buffer.alloc( 0 ) ) {
    const file_size = FILE.readInt32LE( 4 )

    let offset = 8

    const tmds = []
    const textures = []

    while ( offset < file_size ) {
        const section_name = FILE.slice( offset, offset + 4 ).toString()
        const section_size = FILE.readInt32LE( offset + 4 )

        const section_offset = offset + 8
        const section = FILE.slice( section_offset, section_offset + section_size )

        if ( section_name === 'TMDS' ) {
            tmds.push( parseTMD( section, section_offset ) )
        }

        if ( section_name === 'TIMS' ) {
            textures.push( parseTIM( section ) )
        }

        offset += 8 + section_size
    }

    return {
        file_size,

        tmds,
        textures
    }
}

const helpMessage =
`Colony Wars Vengeance Model Converter
Converts original BND models into OBJ models, with textures extracted
Please keep original file names intact to ensure correct splitting of Level-of-detail models

node model_converter.js [OPTIONS] <bnd_files_directory> <output_directory>

List of options:
    --model-info        Additonal JSON info on original
                          model will be placed alongside
    --no-inverse-axis   Do not invert Y axis
    --no-subdirectories Do not separate output by directories
    --no-textures       Do not output texture data
    --no-duplicate-mtl       Do not duplicate mtl files for each LOD model
`

async function main() {

    if ( process.argv.length < 4 ) {
        console.log( helpMessage )
        return
    }

    const [ input_mesh_directory, output_directory ] = process.argv.slice( -2 )

    await fs.mkdir( output_directory, { recursive: true } )

    const model_file_names = await fs.readdir( input_mesh_directory )
    if ( model_file_names.length === 0 ) {
        throw new Error( 'No model files found in <mesh files directory' )
    }

    const model_files = await Promise.all( model_file_names.map( model_file_name => {
        const model_file_path = path.join( input_mesh_directory, model_file_name )
        return fs.readFile( model_file_path ).then( data => ( {
            file_name: path.parse( model_file_name ).name,
            data
        } ) )
    } ) )

    const models = model_files.map( model => {
        const data = parseModel( model.data )
        console.log( `Parsed ${model.file_name}` )

        return {
            ...model,
            data
        }
    } )

    const output_model_info = process.argv.includes( '--model-info' )
    const no_inverse_axis = process.argv.includes( '--no-inverse-axis' )
    const no_subdirectories = process.argv.includes( '--no-subdirectories' )
    const no_textures = process.argv.includes( '--no-textures' )
    const no_duplicate_mtl = process.argv.includes( '--no-duplicate-mtl' )
    const no_lods = process.argv.includes( '--no-lods' )

    const lods = require( './lods' )

    const parsed_models = models.map( model => {
        const { file_name } = model
        const { textures, tmds } = model.data

        let mtl = ''
        if ( no_textures === false ) {
            textures.forEach( ( _, index ) => {
                mtl += `newmtl tex_${index}\n`
                mtl += `map_Kd ${file_name}_tex_${index}.png\n\n`
            } )
        }

        const obj_packs = lods[file_name] ? (
            lods[file_name]
                .split( ';' )
                .map( lod => lod.split( ',' ).map( Number ) )
        ) : (
            [ [ ...new Array( model.data.tmds.length ) ].map( ( _, index ) => index ) ]
        )

        const objs = obj_packs.slice( 0, no_lods ? 1 : undefined ).map( ( obj_pack, obj_pack_index ) => {

            let obj = ''
            if ( no_textures === false ) {
                obj += `mtllib ${file_name}${no_duplicate_mtl ? '' : `_${obj_pack_index}`}.mtl\n`
            }

            let vertex_offset = 0
            let uv_offset = 0

            for ( let obj_index = 0 ; obj_index < obj_pack.length ; obj_index++ ) {
                const tmd = tmds[obj_pack[obj_index]]
                const { vertexes, faces } = tmd

                obj += `o ${file_name}_${obj_index}\n`

                for ( const vertex of vertexes ) {
                    let { x, y, z } = vertex

                    if ( no_inverse_axis === false ) {
                        x *= -1;
                        y *= -1;
                    }

                    obj += `v ${x} ${y} ${z}\n`
                }

                let uv_string = ''
                let face_string = ''
                let last_texture_id = -1

                for ( const face of faces ) {
                    // I don't know why I have to do this, but otherwise it just becomes a swiss cheese
                    const vertexes = [
                        face.vertexes[1],
                        face.vertexes[0],
                        ...face.vertexes.slice( 2 )
                    ]

                    if ( no_textures ) {
                        face_string += `f ${vertexes.map( v => v + 1 + vertex_offset ).join( ' ' )}\n`
                        continue
                    }

                    const { texture_index } = face
                    const uv = [
                        face.uv[1],
                        face.uv[0],
                        ...face.uv.slice( 2 )
                    ]

                    const texture = textures[texture_index]
                    const { width_actual, height } = texture

                    uv_string += uv.map( uv => {
                        const x = uv.x / width_actual
                        const y = 1 - uv.y / height

                        return `vt ${x} ${y}`
                    } ).join( '\n' ) + '\n'

                    if ( last_texture_id !== texture_index ) {
                        face_string += `usemtl tex_${texture_index}\n`

                        last_texture_id = texture_index
                    }

                    const face_vertexes = vertexes
                        .map( ( v, index ) => `${v + 1 + vertex_offset}/${uv_offset + 1 + index}` )
                        .join( ' ' )

                    face_string += `f ${face_vertexes}\n`
                    uv_offset += vertexes.length
                }

                vertex_offset += vertexes.length

                obj += uv_string
                obj += face_string

            }

            return obj

        } )

        return {
            file_name,
            mtl,
            objs,
            textures,
            original_data: model.data
        }
    } )

    parsed_models.forEach( async model => {
        const { file_name, textures, mtl, objs, original_data } = model

        let model_output_directory = output_directory
        if ( no_subdirectories === false ) {
            model_output_directory = path.join( model_output_directory, file_name )
            await fs.mkdir( model_output_directory, { recursive: true } )
        }

        if ( no_textures === false ) {
            const file_names = no_duplicate_mtl ? [ `${file_name}.mtl` ] : [ ...new Array( objs.length ) ].map( ( _, index ) => `${file_name}_${index}.mtl` )

            for ( const file_name of file_names ) {
                await fs.writeFile( path.join( model_output_directory, file_name ), mtl )
            }
        }

        for ( let index = 0 ; index < objs.length ; index++ ) {
            const obj = objs[index]
            await fs.writeFile( path.join( model_output_directory, `${file_name}_${index}.obj` ), obj )
        }

        if ( no_textures === false ) {
            for ( let index = 0 ; index < textures.length ; index++ ) {
                const texture = textures[index]

                const png = await parsedTimToPngBuffer( texture )
                await fs.writeFile( path.join( model_output_directory, `${file_name}_tex_${index}.png` ), png )
            }
        }

        if ( output_model_info ) {
            const { textures, ...data } = original_data
            const model_info = JSON.stringify( data, undefined, 2 )
            await fs.writeFile( path.join( model_output_directory, `${file_name}.json` ), model_info )
        }

        console.log( `Converted ${file_name}` )
    } )
}

(async () => {
    try {
        await main();
    } catch ( e ) {
        console.log( e.stack )
    }
})()