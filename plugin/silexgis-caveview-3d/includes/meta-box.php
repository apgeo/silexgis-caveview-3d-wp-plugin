<?php
/**
 * The "3D model (SilexCaveEmbed)" box on pages and posts: one textarea holding the page's
 * configuration as JSON, saved to the post meta _silex_cave_embed_config.
 *
 * A classic meta box, deliberately. It is rendered inside the block editor through the
 * editor's own bridge for such boxes and saved by the same form post the classic editor
 * uses, so one piece of code serves both editors and nothing is built on the editor's
 * JavaScript. The 'advanced' context puts it below the content, where a box holding a
 * few hundred lines of JSON has the width to be read.
 *
 * What is saved is what json_decode() accepted, printed back in a readable layout. A text
 * that is not JSON is refused: the page keeps the configuration it had, the person is
 * told where the text stops being JSON, and what they typed is offered back in the box
 * on its next render rather than lost. The meta is also registered for the REST API, so
 * a tool can set it; there, a text that is not JSON is a 400 naming the same place.
 *
 * WHO MAY WRITE IT, AND WHAT IT MAY NAME
 *
 * A configuration names the directories a page's stylesheet, model, pictures and trips
 * are requested from, by every reader. That is what a <link> or a <script> in the content
 * would do, and WordPress strips those from the content of anybody who lacks the
 * unfiltered_html capability — on a single site, everybody below Editor. So being able
 * to edit the post is not enough to write its configuration: the box is not offered to a
 * user without that capability, its save handler refuses them, and so does the REST API.
 * Reading is not restricted further: whoever can edit the post can see what it holds.
 *
 * Separately, and for every writer, the fields that become addresses must stay on this
 * site (silex_ce_config_address_faults() has the rule). A configuration that breaks it is
 * refused like a text that is not JSON, and one that reaches the database some other way
 * is not printed.
 */

defined( 'ABSPATH' ) || exit;

/** The post types a model can be put on. */
function silex_ce_post_types() {
	return array( 'page', 'post' );
}

add_action( 'init', function () {
	foreach ( silex_ce_post_types() as $type ) {
		register_post_meta( $type, SILEX_CE_META_KEY, array(
			'type'              => 'string',
			'single'            => true,
			'description'       => 'The configuration object SilexCaveEmbed.create() receives, as JSON.',
			'show_in_rest'      => true,
			'sanitize_callback' => 'silex_ce_sanitize_config_meta',
			// The key starts with an underscore, which keeps it out of the Custom Fields box
			// and out of the REST API unless somebody is allowed by name. Editing the post
			// is not the right name for that: see the top of this file. This callback
			// answers for every way a meta is written with a capability check — the REST
			// API, XML-RPC, the Custom Fields box — and for the user asked about, who is
			// not always the current one.
			'auth_callback'     => function ( $allowed, $meta_key, $post_id, $user_id ) {
				return user_can( $user_id, 'unfiltered_html' ) && user_can( $user_id, 'edit_post', $post_id );
			},
		) );
	}
} );

/**
 * Whether the current user may write a post's configuration (any post's, for a post that
 * does not exist yet): the capability that lets them put a stylesheet or a script on a
 * page, and the right to edit this one.
 */
function silex_ce_can_write_config( $post_id = 0 ) {
	return current_user_can( 'unfiltered_html' ) && ( ! $post_id || current_user_can( 'edit_post', $post_id ) );
}

/**
 * What any writer of the meta ends up storing: valid JSON in the readable layout, an empty
 * string for nothing, and a text that is not JSON unchanged — a sanitiser cannot refuse,
 * and silently storing something else would hide the fault; stored as it is, the page says
 * in its console that the configuration was ignored and the box shows where it fails. The
 * same goes for a configuration whose addresses leave this site: it is stored as written,
 * never printed, and the page's console and the box both name the fields.
 */
function silex_ce_sanitize_config_meta( $value ) {
	if ( ! is_string( $value ) || '' === trim( $value ) ) {
		return '';
	}
	$parsed = silex_ce_parse_config( $value );

	return isset( $parsed['config'] ) ? silex_ce_config_to_string( $parsed['config'] ) : $value;
}

/**
 * Whether a value sent for the meta is what the post already holds — nothing for a post
 * that holds nothing, or the same configuration, whatever its layout.
 */
function silex_ce_config_is_unchanged( $post_id, $value ) {
	$stored = $post_id ? get_post_meta( $post_id, SILEX_CE_META_KEY, true ) : '';
	$stored = is_string( $stored ) ? $stored : '';
	if ( null === $value ) {
		return '' === trim( $stored );
	}
	if ( ! is_string( $value ) ) {
		return false;
	}

	return $value === $stored || silex_ce_sanitize_config_meta( $value ) === silex_ce_sanitize_config_meta( $stored );
}

/**
 * A REST write of the meta is judged here, before the post itself is created or changed,
 * so that a refusal leaves nothing half-done behind it: a writer without the capability
 * is a 403, a text that is not JSON is a 400 naming the place, and a configuration whose
 * addresses leave this site is a 400 naming the fields.
 *
 * A value that changes nothing is taken out of the request instead of being judged. The
 * block editor sends every registered meta back whenever any one of them was edited, so
 * without this an author changing some other field of a page whose configuration an
 * editor had set — or of a page that has none — would be refused the whole save for a
 * configuration they never touched.
 */
foreach ( silex_ce_post_types() as $silex_ce_type ) {
	add_filter( 'rest_pre_insert_' . $silex_ce_type, function ( $prepared, $request ) {
		$meta = $request->get_param( 'meta' );
		if ( ! is_array( $meta ) || ! array_key_exists( SILEX_CE_META_KEY, $meta ) ) {
			return $prepared;
		}
		$value   = $meta[ SILEX_CE_META_KEY ];
		$post_id = ( is_object( $prepared ) && ! empty( $prepared->ID ) ) ? (int) $prepared->ID : 0;

		if ( silex_ce_config_is_unchanged( $post_id, $value ) ) {
			unset( $meta[ SILEX_CE_META_KEY ] );
			$request->set_param( 'meta', $meta );

			return $prepared;
		}
		if ( ! silex_ce_can_write_config( $post_id ) ) {
			return new WP_Error(
				'silex_ce_config_forbidden',
				SILEX_CE_META_KEY . ': ' . __( 'a model\'s configuration can be written only by an account with the unfiltered_html capability (on a single site: an Editor or an Administrator)', 'silexgis-caveview-3d' ),
				array( 'status' => rest_authorization_required_code() )
			);
		}
		if ( null === $value || ( is_string( $value ) && '' === trim( $value ) ) ) {
			return $prepared;   // clearing it
		}
		$parsed = is_string( $value ) ? silex_ce_parse_config( $value ) : array( 'error' => __( 'it must be a text holding a JSON object', 'silexgis-caveview-3d' ) );
		if ( isset( $parsed['error'] ) ) {
			return new WP_Error(
				'silex_ce_config_invalid',
				SILEX_CE_META_KEY . ': ' . $parsed['error'],
				array( 'status' => 400 )
			);
		}
		$refused = silex_ce_config_address_faults( $parsed['config'] );
		if ( $refused ) {
			return new WP_Error(
				'silex_ce_config_address',
				SILEX_CE_META_KEY . ': ' . silex_ce_config_fault_text( $refused ),
				array( 'status' => 400, 'fields' => $refused )
			);
		}

		return $prepared;
	}, 10, 2 );
}
unset( $silex_ce_type );

/* ---- the box --------------------------------------------------------------------- */

add_action( 'add_meta_boxes', function () {
	// Not offered to a user who could not save it: a field that is shown and then refused
	// teaches nothing, and the configuration is the page's code rather than its text.
	if ( ! silex_ce_can_write_config() ) {
		return;
	}
	foreach ( silex_ce_post_types() as $type ) {
		add_meta_box(
			'silex_cave_embed',
			__( '3D model (SilexCaveEmbed)', 'silexgis-caveview-3d' ),
			'silex_ce_meta_box_render',
			$type,
			'advanced',
			'default',
			array(
				// Not a box kept only for sites without the block editor: it has no block
				// equivalent and must be shown in both editors.
				'__back_compat_meta_box'             => false,
				'__block_editor_compatible_meta_box' => true,
			)
		);
	}
} );

function silex_ce_meta_box_render( $post ) {
	wp_nonce_field( 'silex_ce_config_' . $post->ID, 'silex_ce_config_nonce' );

	$stored   = get_post_meta( $post->ID, SILEX_CE_META_KEY, true );
	$stored   = is_string( $stored ) ? $stored : '';
	$pending  = silex_ce_take_notice();
	$rejected = ( $pending && isset( $pending['post'] ) && (int) $pending['post'] === (int) $post->ID && isset( $pending['rejected'] ) )
		? $pending['rejected']
		: null;
	$fault    = ( '' !== trim( $stored ) ) ? silex_ce_parse_config( $stored ) : array();
	$refused  = isset( $fault['config'] ) ? silex_ce_config_address_faults( $fault['config'] ) : array();
	$readme   = plugins_url( 'README.md', SILEX_CE_FILE ) . '#configuring-a-page';
	?>
	<?php if ( null !== $rejected ) : ?>
		<div class="notice notice-error inline"><p>
			<?php echo esc_html( $pending['message'] ); ?>
			<?php esc_html_e( 'The refused text is the one below; the page goes on using the configuration saved before.', 'silexgis-caveview-3d' ); ?>
		</p></div>
	<?php elseif ( isset( $fault['error'] ) ) : ?>
		<div class="notice notice-error inline"><p>
			<?php esc_html_e( 'The configuration saved on this page is not valid JSON and is ignored when the page is shown:', 'silexgis-caveview-3d' ); ?>
			<?php echo esc_html( $fault['error'] ); ?>
		</p></div>
	<?php elseif ( $refused ) : ?>
		<div class="notice notice-error inline"><p>
			<?php
			/* translators: %s: the refused fields and the rule they break */
			echo esc_html( sprintf( __( 'The configuration saved on this page is not printed, because %s.', 'silexgis-caveview-3d' ), silex_ce_config_fault_text( $refused ) ) );
			?>
		</p></div>
	<?php endif; ?>
	<p class="description">
		<?php esc_html_e( 'The configuration of the model on this page — the JSON object SilexCaveEmbed.create() receives: the cave, the places, the photographs and the published trips. The page also needs the [silexgis_cave] shortcode in its content, which puts the model\'s container on the page.', 'silexgis-caveview-3d' ); ?>
		<?php esc_html_e( 'Left empty, the page looks for its configuration in the pages/<slug>.js file beside the component; the shortcode\'s config="..." attribute names such a file explicitly and comes first.', 'silexgis-caveview-3d' ); ?>
		<?php
		printf(
			/* translators: %s: the fields that hold an address */
			esc_html__( 'The addresses in the configuration (%s) must be paths on this site: they begin with a single “/” and contain no host or scheme (https://…), no “//”, no “\\” and no “..”.', 'silexgis-caveview-3d' ),
			esc_html( implode( ', ', silex_ce_config_address_fields()['paths'] ) )
		);
		?>
		<a href="<?php echo esc_url( $readme ); ?>" target="_blank" rel="noopener"><?php esc_html_e( 'The three ways, described (README, “Configuring a page”)', 'silexgis-caveview-3d' ); ?></a>
	</p>
	<textarea name="silex_ce_config" id="silex_ce_config" rows="16" class="large-text code" spellcheck="false"
		placeholder='{ "container": "cave_model", "placeList": "cave_model_places", "survey": "…" }'><?php
		echo esc_textarea( null !== $rejected ? $rejected : $stored );
	?></textarea>
	<p class="description" id="silex_ce_config_status" aria-live="polite"></p>
	<script>
	(function () {
		// Said while typing, so a slip is seen before the save refuses it: the browser's own
		// parser is the judge here, the server's at save time.
		var box = document.getElementById('silex_ce_config');
		var status = document.getElementById('silex_ce_config_status');
		if (!box || !status) return;
		// The fields that become addresses, and the shapes the server allows them at save
		// time. The server decides; this only says so before the save, by the same rule,
		// and takes the list of fields from the server so the two cannot name different ones.
		var FIELDS = <?php echo wp_json_encode( silex_ce_config_address_fields() ); ?>;
		function fieldOf(config, path) {
			var at = config, keys = path.split('.');
			for (var i = 0; i < keys.length; i++) {
				if (!at || typeof at !== 'object' || Array.isArray(at) || !Object.prototype.hasOwnProperty.call(at, keys[i])) return { found: false };
				at = at[keys[i]];
			}
			return { found: true, value: at };
		}
		function climbs(v) { return /(?:^|\/)(?:\.|%2e){2}(?:[\/?#]|$)/i.test(v); }
		function odd(v) { return v.indexOf('//') >= 0 || /[\\\x00-\x1f\x7f]/.test(v) || climbs(v); }
		function sitePath(v) { return typeof v === 'string' && /^\/[^\/\\]/.test(v) && !odd(v); }
		function nameBeneath(v) { return typeof v === 'string' && v !== '' && !/^(?:\/|[A-Za-z][A-Za-z0-9+.\-]*:)/.test(v) && !odd(v); }
		function protoKeys(v, path, out) {
			if (!v || typeof v !== 'object' || out.length >= 8) return;
			Object.keys(v).forEach(function (k) {
				var here = Array.isArray(v) ? path + '[' + k + ']' : (path ? path + '.' + k : k);
				if (!Array.isArray(v) && k === '__proto__') out.push(here);
				else protoKeys(v[k], here, out);
			});
		}
		function addressFaults(config) {
			var out = [];
			FIELDS.paths.forEach(function (p) {
				var f = fieldOf(config, p);
				if (f.found && !sitePath(f.value)) out.push(p);
			});
			FIELDS.names.forEach(function (p) {
				var f = fieldOf(config, p);
				if (f.found && !(Array.isArray(f.value) ? f.value : [f.value]).every(nameBeneath)) out.push(p);
			});
			FIELDS.codes.forEach(function (p) {
				var f = fieldOf(config, p);
				if (f.found && f.value !== null && f.value !== false && f.value !== ''
					&& !(typeof f.value === 'string' && /^[A-Za-z0-9_-]+$/.test(f.value))) out.push(p);
			});
			protoKeys(config, '', out);
			return out;
		}
		// Why the text as it stands could not be saved, or '' when it could.
		function fault() {
			var text = box.value.trim();
			if (!text) return '';
			var v;
			try {
				v = JSON.parse(text);
			} catch (e) {
				return <?php echo wp_json_encode( __( 'it is not valid JSON: ', 'silexgis-caveview-3d' ) ); ?> + e.message;
			}
			if (!v || typeof v !== 'object' || Array.isArray(v)) {
				return <?php echo wp_json_encode( __( 'it must be a JSON object ({ … })', 'silexgis-caveview-3d' ) ); ?>;
			}
			var refused = addressFaults(v);
			return refused.length
				? <?php echo wp_json_encode( __( 'these fields break the rule for addresses above: ', 'silexgis-caveview-3d' ) ); ?> + refused.join(', ')
				: '';
		}
		function tell() {
			var text = box.value.trim();
			if (!text) { status.textContent = ''; return; }
			var why = fault();
			if (why) {
				status.textContent = why.charAt(0).toUpperCase() + why.slice(1) + '.';
				return;
			}
			// One sentence with the count in it, put in by a function so that nothing in the
			// text is read as a replacement pattern.
			var count = String(Object.keys(JSON.parse(text)).length);
			status.textContent = <?php
				/* translators: %d: how many fields the configuration has at its top level */
				echo wp_json_encode( __( 'Valid JSON. Top-level fields: %d.', 'silexgis-caveview-3d' ) );
			?>.replace('%d', function () { return count; });
		}
		box.addEventListener('input', tell);
		tell();

		// In the block editor the boxes are posted after the page is saved, and the answer
		// is a redirect the editor throws away, so the server's notice can only reach the
		// next screen. The editor is told here, the moment the boxes have been posted, that
		// what the box held was refused — by the same parser that judged it while typing.
		// This box is printed in the page body, before the editor's own scripts in the
		// footer, so the editor is looked for once the document has been parsed.
		function watchEditor() {
			if (!window.wp || !wp.data || !wp.data.subscribe) return;
			var editPost = wp.data.select('core/edit-post');
			var notices = wp.data.dispatch('core/notices');
			if (!editPost || !editPost.isSavingMetaBoxes || !notices) return;   // not the block editor
			var wasSaving = false;
			wp.data.subscribe(function () {
				var saving = editPost.isSavingMetaBoxes();
				if (wasSaving && !saving) {
					var why = fault();
					if (why) {
						notices.createErrorNotice(
							<?php
							/* translators: %s: why the configuration was refused */
							echo wp_json_encode( __( 'The 3D model\'s configuration was not saved, because %s. The page keeps the configuration it had.', 'silexgis-caveview-3d' ) );
							?>.replace('%s', function () { return why; }),
							{ id: 'silex-ce-config', isDismissible: true }
						);
					}
				}
				wasSaving = saving;
			});
		}
		if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watchEditor);
		else watchEditor();
	})();
	</script>
	<?php
}

/* ---- saving ----------------------------------------------------------------------- */

add_action( 'save_post', function ( $post_id ) {
	if ( ! isset( $_POST['silex_ce_config_nonce'] )
		|| ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['silex_ce_config_nonce'] ) ), 'silex_ce_config_' . $post_id ) ) {
		return;   // not this box's form: a REST save, a revision, an autosave, somebody else's post
	}
	if ( defined( 'DOING_AUTOSAVE' ) && DOING_AUTOSAVE ) {
		return;
	}
	// The box is not offered to a user who may not write the configuration, so a form
	// that carries it anyway was not made by this screen for this user; nothing of it is
	// taken, and the page keeps what it had.
	if ( ! silex_ce_can_write_config( $post_id ) ) {
		return;
	}
	if ( ! isset( $_POST['silex_ce_config'] ) ) {
		return;
	}

	$raw = trim( (string) wp_unslash( $_POST['silex_ce_config'] ) );
	if ( '' === $raw ) {
		delete_post_meta( $post_id, SILEX_CE_META_KEY );
		return;
	}

	$parsed = silex_ce_parse_config( $raw );
	if ( isset( $parsed['error'] ) ) {
		// The previous value is kept; the person is told where, and gets their text back.
		silex_ce_queue_notice(
			/* translators: %s: where the text stops being JSON */
			sprintf( __( 'The 3D model\'s configuration was not saved, because it is not valid JSON — %s. The page keeps the configuration it had.', 'silexgis-caveview-3d' ), $parsed['error'] ),
			$post_id,
			$raw
		);
		return;
	}

	$refused = silex_ce_config_address_faults( $parsed['config'] );
	if ( $refused ) {
		// Refused as a text that is not JSON is: kept out, said why, offered back.
		silex_ce_queue_notice(
			/* translators: %s: why the configuration was refused */
			sprintf( __( 'The 3D model\'s configuration was not saved, because %s. The page keeps the configuration it had.', 'silexgis-caveview-3d' ), silex_ce_config_fault_text( $refused ) ),
			$post_id,
			$raw
		);
		return;
	}

	// update_post_meta() expects slashed input, as the form data was before wp_unslash()
	// above, and strips the slashes itself; handed the text as it is, it would take the
	// backslash out of every \" inside a label and store something that is no longer JSON.
	update_post_meta( $post_id, SILEX_CE_META_KEY, wp_slash( silex_ce_config_to_string( $parsed['config'] ) ) );
} );

/* ---- the notice that outlives the save ------------------------------------------------ */

/**
 * The save happens in a request whose answer is a redirect (classic editor) or a reply to
 * the editor's own JavaScript (block editor), so a message for the person is kept until
 * the next admin screen they see — per user, for ten minutes — and shown there once.
 */
function silex_ce_queue_notice( $message, $post_id, $rejected ) {
	set_transient( 'silex_ce_notice_' . get_current_user_id(), array(
		'message'  => $message,
		'post'     => (int) $post_id,
		'rejected' => $rejected,
	), 10 * MINUTE_IN_SECONDS );
}

/**
 * The block editor posts the meta boxes to post.php and follows the redirect it is answered
 * with, rendering a whole editor screen that it then throws away. A notice taken off the
 * queue by that screen would never be seen, so the redirect is marked when the request it
 * answers was the editor's meta box post, and the screen it leads to leaves the queue alone.
 */
add_filter( 'redirect_post_location', function ( $location ) {
	return isset( $_GET['meta-box-loader'] ) ? add_query_arg( 'silex-ce-after-boxes', '1', $location ) : $location;
} );

/** The queued notice, read once per request and taken off the queue as it is read. */
function silex_ce_take_notice() {
	static $notice = null;
	static $taken  = false;
	if ( isset( $_GET['silex-ce-after-boxes'] ) ) {
		return null;   // the screen nobody sees (above)
	}
	if ( ! $taken ) {
		$taken = true;
		$key   = 'silex_ce_notice_' . get_current_user_id();
		$value = get_transient( $key );
		if ( is_array( $value ) ) {
			$notice = $value;
			delete_transient( $key );
		}
	}

	return $notice;
}

add_action( 'admin_notices', function () {
	$notice = silex_ce_take_notice();
	if ( ! $notice ) {
		return;
	}
	?>
	<div class="notice notice-error is-dismissible silex-ce-config-notice"><p>
		<strong><?php esc_html_e( '3D model (SilexCaveEmbed):', 'silexgis-caveview-3d' ); ?></strong>
		<?php echo esc_html( $notice['message'] ); ?>
		<?php if ( ! empty( $notice['post'] ) ) : ?>
			<a href="<?php echo esc_url( get_edit_post_link( (int) $notice['post'] ) ); ?>"><?php esc_html_e( 'Open the page', 'silexgis-caveview-3d' ); ?></a>
		<?php endif; ?>
	</p></div>
	<?php
} );
