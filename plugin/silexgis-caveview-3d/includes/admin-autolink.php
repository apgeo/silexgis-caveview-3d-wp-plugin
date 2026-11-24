<?php
/**
 * Automatic place links: the editable half.
 *
 * The 3D model can be driven from the prose — "we went down to the Upper aven"
 * becomes a link that flies the camera there. Most of the vocabulary needs no
 * maintenance: the surveyors' own station comments travel inside the survey file, and
 * depths like "-815 m" are matched by number. This screen is for the rest — the names a
 * survey does not carry, and the spellings people actually write:
 *
 *     p8.christmas_aven.25c  ->  Upper aven | the upper aven | U.A.
 *
 * The table is stored as one option and handed to the page as JSON. The shape is
 * deliberately portable — station, names, depth — so the same table can later be served
 * by SilexGIS for pages that are not WordPress, without re-typing any of it.
 */

defined( 'ABSPATH' ) || exit;

const SILEX_AUTOLINK_OPTION = 'silex_cave_autolink';

/** Stored table, always in the current shape. */
function silex_autolink_data() {
	$raw = get_option( SILEX_AUTOLINK_OPTION );
	$d   = is_string( $raw ) ? json_decode( $raw, true ) : $raw;
	if ( ! is_array( $d ) ) $d = array();

	return array(
		'version'  => 1,
		'switches' => wp_parse_args(
			isset( $d['switches'] ) && is_array( $d['switches'] ) ? $d['switches'] : array(),
			array( 'enabled' => true, 'comments' => true, 'aliases' => true, 'depths' => true )
		),
		'entries'  => isset( $d['entries'] ) && is_array( $d['entries'] ) ? $d['entries'] : array(),
	);
}

/**
 * Names arrive as one field because that is how people think of them — a place and the
 * several things it gets called. Split on | , ; and newline, trimmed, blanks dropped.
 */
function silex_autolink_split_names( $s ) {
	$parts = preg_split( '/[|;,\r\n]+/u', (string) $s );
	$out   = array();
	foreach ( $parts as $p ) {
		$p = trim( $p );
		if ( $p !== '' ) $out[] = $p;
	}
	return array_values( array_unique( $out ) );
}

add_action( 'admin_menu', function () {
	add_options_page(
		__( '3D models — automatic links', 'silexgis-caveview-3d' ),
		__( '3D models (caves)', 'silexgis-caveview-3d' ),
		'manage_options',
		'silex-cave-autolink',
		'silex_autolink_screen'
	);
} );

function silex_autolink_screen() {
	if ( ! current_user_can( 'manage_options' ) ) wp_die( esc_html__( 'You do not have the necessary permission.', 'silexgis-caveview-3d' ) );

	$notice = '';
	if ( isset( $_POST['silex_autolink_save'] ) ) {
		check_admin_referer( 'silex_autolink' );

		$switches = array(
			'enabled'  => ! empty( $_POST['sw_enabled'] ),
			'comments' => ! empty( $_POST['sw_comments'] ),
			'aliases'  => ! empty( $_POST['sw_aliases'] ),
			'depths'   => ! empty( $_POST['sw_depths'] ),
		);

		$entries = array();
		$seen    = array();
		$rows    = isset( $_POST['row'] ) && is_array( $_POST['row'] ) ? $_POST['row'] : array();
		foreach ( $rows as $row ) {
			$station = isset( $row['station'] ) ? trim( wp_unslash( $row['station'] ) ) : '';
			$names   = isset( $row['names'] ) ? wp_unslash( $row['names'] ) : '';
			// Emptying a row is how the screen deletes one, so an empty row is dropped
			// rather than treated as an error.
			if ( $station === '' ) continue;
			$list = silex_autolink_split_names( $names );
			if ( ! $list ) continue;
			// A station path is dot-separated survey/station identifiers; nothing else is
			// allowed near a value the page will put into a data attribute.
			if ( ! preg_match( '/^[A-Za-z0-9_.\-]+$/', $station ) ) continue;
			$entry = array(
				'cave'    => isset( $row['cave'] ) ? sanitize_text_field( wp_unslash( $row['cave'] ) ) : '',
				'station' => $station,
				'names'   => array_map( 'sanitize_text_field', $list ),
				'enabled' => ! empty( $row['enabled'] ),
			);
			if ( isset( $row['depth'] ) && trim( $row['depth'] ) !== '' && is_numeric( $row['depth'] ) ) {
				$entry['depth'] = (float) $row['depth'];
			}
			// Two rows for one station are not an error — somebody adding a name is likely
			// to type the station again rather than hunt for the existing row — so they are
			// merged instead of both being kept. Names keep their order, duplicates drop.
			$key = $entry['cave'] . '|' . $entry['station'];
			if ( isset( $seen[ $key ] ) ) {
				$at  = $seen[ $key ];
				$entries[ $at ]['names'] = array_values( array_unique(
					array_merge( $entries[ $at ]['names'], $entry['names'] ) ) );
				if ( isset( $entry['depth'] ) ) $entries[ $at ]['depth'] = $entry['depth'];
				$entries[ $at ]['enabled'] = $entries[ $at ]['enabled'] || $entry['enabled'];
				continue;
			}
			$seen[ $key ] = count( $entries );
			$entries[]    = $entry;
		}

		update_option( SILEX_AUTOLINK_OPTION,
			wp_json_encode( array( 'version' => 1, 'switches' => $switches, 'entries' => $entries ) ) );
		/* translators: %d: how many rows of the table were saved */
		$notice = sprintf( _n( 'Saved: %d entry.', 'Saved: %d entries.', count( $entries ), 'silexgis-caveview-3d' ), count( $entries ) );
	}

	$data = silex_autolink_data();
	$sw   = $data['switches'];
	$rows = $data['entries'];
	$rows[] = array( 'cave' => '', 'station' => '', 'names' => array(), 'enabled' => true ); // one blank row
	?>
	<div class="wrap">
		<h1><?php esc_html_e( 'Automatic links to the 3D model', 'silexgis-caveview-3d' ); ?></h1>
		<?php if ( $notice ) : ?><div class="notice notice-success is-dismissible"><p><?php echo esc_html( $notice ); ?></p></div><?php endif; ?>

		<p style="max-width:52em">
			<?php esc_html_e( 'The text of the pages that hold a 3D model is read through as they are shown, and the names of the places it recognises become links that take the camera there. Nothing in the page\'s content is changed — the links are added only as it is shown.', 'silexgis-caveview-3d' ); ?>
		</p>

		<form method="post">
			<?php wp_nonce_field( 'silex_autolink' ); ?>
			<?php // The save handler keys on this rather than on submit_button()'s generic
			      // "submit", so the form must actually carry it — without this the page
			      // reloads and silently saves nothing. ?>
			<input type="hidden" name="silex_autolink_save" value="1">

			<h2><?php esc_html_e( 'Sources', 'silexgis-caveview-3d' ); ?></h2>
			<table class="form-table" role="presentation"><tbody>
				<tr><th scope="row"><?php esc_html_e( 'Enabled', 'silexgis-caveview-3d' ); ?></th><td>
					<label><input type="checkbox" name="sw_enabled" <?php checked( $sw['enabled'] ); ?>> <?php esc_html_e( 'Make links automatically', 'silexgis-caveview-3d' ); ?></label>
				</td></tr>
				<tr><th scope="row"><?php esc_html_e( 'From the survey', 'silexgis-caveview-3d' ); ?></th><td>
					<label><input type="checkbox" name="sw_comments" <?php checked( $sw['comments'] ); ?>> <?php esc_html_e( 'The names the surveyors gave (the stations\' comments)', 'silexgis-caveview-3d' ); ?></label>
					<p class="description"><?php esc_html_e( 'They need no upkeep: they come from the survey file.', 'silexgis-caveview-3d' ); ?></p>
				</td></tr>
				<tr><th scope="row"><?php esc_html_e( 'From the list below', 'silexgis-caveview-3d' ); ?></th><td>
					<label><input type="checkbox" name="sw_aliases" <?php checked( $sw['aliases'] ); ?>> <?php esc_html_e( 'The names entered by hand', 'silexgis-caveview-3d' ); ?></label>
				</td></tr>
				<tr><th scope="row"><?php esc_html_e( 'Depths', 'silexgis-caveview-3d' ); ?></th><td>
					<label><input type="checkbox" name="sw_depths" <?php checked( $sw['depths'] ); ?>> <?php esc_html_e( 'Mentions such as “−815 m”', 'silexgis-caveview-3d' ); ?></label>
					<p class="description"><?php esc_html_e( 'Only with a sign: “815 m of rope” does not become a link.', 'silexgis-caveview-3d' ); ?></p>
				</td></tr>
			</tbody></table>

			<h2><?php esc_html_e( 'Names', 'silexgis-caveview-3d' ); ?></h2>
			<p class="description" style="max-width:52em">
				<?php
				printf(
					/* translators: 1: the separator, 2: the name of the Cave column, 3: an example file name */
					esc_html__( 'A station can have several names, separated by %1$s. %2$s is the name of the survey file (e.g. %3$s); left empty, the row applies to every cave. A name used by two different stations is ignored — an ambiguous link would be a riddle, not a help.', 'silexgis-caveview-3d' ),
					'<code>|</code>',
					'<strong>' . esc_html__( 'Cave', 'silexgis-caveview-3d' ) . '</strong>',
					'<code>P8_Master.3d</code>'
				);
				?>
			</p>

			<table class="widefat striped" id="silex-autolink-table">
				<thead><tr>
					<th style="width:18%"><?php esc_html_e( 'Cave', 'silexgis-caveview-3d' ); ?></th>
					<th style="width:30%"><?php esc_html_e( 'Station', 'silexgis-caveview-3d' ); ?></th>
					<th><?php
						/* translators: %s: the separator */
						printf( esc_html__( 'Names (separated by %s)', 'silexgis-caveview-3d' ), '<code>|</code>' );
					?></th>
					<th style="width:8%"><?php esc_html_e( 'Depth', 'silexgis-caveview-3d' ); ?></th>
					<th style="width:6%"><?php esc_html_e( 'Active', 'silexgis-caveview-3d' ); ?></th>
					<th style="width:4%"></th>
				</tr></thead>
				<tbody>
				<?php foreach ( $rows as $i => $r ) : ?>
					<tr>
						<td><input type="text" name="row[<?php echo $i; ?>][cave]" value="<?php echo esc_attr( isset( $r['cave'] ) ? $r['cave'] : '' ); ?>" placeholder="<?php esc_attr_e( 'all', 'silexgis-caveview-3d' ); ?>" style="width:100%"></td>
						<td><input type="text" name="row[<?php echo $i; ?>][station]" value="<?php echo esc_attr( isset( $r['station'] ) ? $r['station'] : '' ); ?>" placeholder="p8.christmas_aven.2" style="width:100%"></td>
						<td><input type="text" name="row[<?php echo $i; ?>][names]" value="<?php echo esc_attr( isset( $r['names'] ) ? implode( ' | ', (array) $r['names'] ) : '' ); ?>" placeholder="Aven foot | the foot of the aven" style="width:100%"></td>
						<td><input type="text" name="row[<?php echo $i; ?>][depth]" value="<?php echo esc_attr( isset( $r['depth'] ) ? $r['depth'] : '' ); ?>" style="width:100%"></td>
						<td style="text-align:center"><input type="checkbox" name="row[<?php echo $i; ?>][enabled]" <?php checked( ! isset( $r['enabled'] ) || $r['enabled'] ); ?>></td>
						<td><button type="button" class="button-link silex-row-remove" title="<?php esc_attr_e( 'Delete the row', 'silexgis-caveview-3d' ); ?>">✕</button></td>
					</tr>
				<?php endforeach; ?>
				</tbody>
			</table>
			<p><button type="button" class="button" id="silex-add-row"><?php esc_html_e( '+ New row', 'silexgis-caveview-3d' ); ?></button></p>

			<?php submit_button( __( 'Save', 'silexgis-caveview-3d' ) ); ?>

			<h2><?php esc_html_e( 'Export / import', 'silexgis-caveview-3d' ); ?></h2>
			<p class="description" style="max-width:52em">
				<?php esc_html_e( 'The same list as JSON, for moving it elsewhere (into SilexGIS, for example, for pages that are not WordPress).', 'silexgis-caveview-3d' ); ?>
			</p>
			<textarea readonly rows="8" style="width:100%;font-family:monospace;font-size:12px"><?php
				echo esc_textarea( wp_json_encode( $data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES ) );
			?></textarea>
		</form>
	</div>

	<script>
	(function () {
		var table = document.getElementById('silex-autolink-table');
		document.getElementById('silex-add-row').addEventListener('click', function () {
			var body = table.tBodies[0];
			var last = body.rows[body.rows.length - 1];
			var copy = last.cloneNode(true);
			// Re-index the new row's field names, and start it empty.
			var n = body.rows.length;
			[].forEach.call(copy.querySelectorAll('input'), function (input) {
				input.name = input.name.replace(/row\[\d+\]/, 'row[' + n + ']');
				if (input.type === 'checkbox') input.checked = true; else input.value = '';
			});
			body.appendChild(copy);
			var first = copy.querySelector('input');
			if (first) first.focus();
		});
		table.addEventListener('click', function (e) {
			if (!e.target.classList.contains('silex-row-remove')) return;
			var body = table.tBodies[0];
			if (body.rows.length > 1) e.target.closest('tr').remove();
			else [].forEach.call(body.rows[0].querySelectorAll('input[type=text]'), function (i) { i.value = ''; });
		});
	})();
	</script>
	<?php
}

/**
 * Hands the table to the page. Printed before the component's script so it is there when
 * the component asks; only the rows that are switched on, grouped the way the component
 * looks them up (by survey file name, with '*' meaning every cave).
 */
function silex_autolink_inline_script() {
	$data = silex_autolink_data();
	if ( empty( $data['switches']['enabled'] ) ) {
		return 'window.SilexCaveAutolinkSwitches = { enabled: false };';
	}

	$grouped = array();
	foreach ( $data['entries'] as $e ) {
		if ( isset( $e['enabled'] ) && ! $e['enabled'] ) continue;
		$key = ( isset( $e['cave'] ) && $e['cave'] !== '' ) ? $e['cave'] : '*';
		$row = array( 'station' => $e['station'], 'names' => $e['names'] );
		if ( isset( $e['depth'] ) ) $row['depth'] = $e['depth'];
		$grouped[ $key ][] = $row;
	}

	// JSON_HEX_TAG: the names are stored text printed inside a script element, where a
	// "<!--" or a "</script" in one of them would end or derail the element whatever the
	// JSON around it says. Written as \u003C the same value reaches the script unchanged.
	return 'window.SilexCaveAliases = ' . wp_json_encode( (object) $grouped, JSON_HEX_TAG ) . ';'
		. 'window.SilexCaveAutolinkSwitches = ' . wp_json_encode( $data['switches'], JSON_HEX_TAG ) . ';';
}
