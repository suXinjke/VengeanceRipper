const fs = require( 'fs' ).promises
const path = require( 'path' )

function parseFiles( FILE = Buffer.alloc( 0 ) ) {
    const file_count = FILE.readInt32LE( 0 )

    const files = []

    for ( let i = 0 ; i < file_count ; i++ ) {
        const offset = 4 + 0x14 * i
        const file_name_garbage = FILE.slice( offset, offset + 0x10 )
            .toString( 'utf8' )

        const file_name_match = file_name_garbage
            .match( /[^.]+\.[A-Z]{1,3}/ )

        if ( !file_name_match ) {
            throw new Error( `Failed to normalize file name ${file_name_garbage}` )
        }

        const file_name = file_name_match[0]
        const file_offset = FILE.slice( offset + 0x10, offset + 0x14 ).readInt32LE()

        files.push( {
            file_name,
            file_offset,
            file_size: 0
        } )

        const previous_file = files[files.length - 2]
        if ( previous_file ) {
            previous_file.file_size = file_offset - previous_file.file_offset
        }
    }

    const last_file = files[files.length - 1]
    last_file.file_size = FILE.length - last_file.file_offset;

    return files
}

const helpMessage =
`Colony Wars Vengeance GAME.RSC extractor
Extracts GAME.RSC contents

node game_rsc_extract.js <GAME.RSC path> <output_directory>
`

async function main() {
    if ( process.argv.length < 4 ) {
        console.log( helpMessage )
        return
    }

    const [ GAME_RSC_PATH, output_directory ] = process.argv.slice( -2 )

    await fs.mkdir( output_directory, { recursive: true } )

    const GAME_RSC = await fs.readFile( GAME_RSC_PATH )

    const files = parseFiles( GAME_RSC )

    files.forEach( ( { file_name, file_offset, file_size } ) => {
        const data = GAME_RSC.slice( file_offset, file_offset + file_size )
        const file_path = path.join( output_directory, file_name )

        fs.writeFile( file_path, data )
            .then( _ => console.log( `Extracted ${file_name}` ) )
    } )
}

(async () => {
    try {
        await main();
    } catch ( e ) {
        console.log( e.stack )
    }
})()