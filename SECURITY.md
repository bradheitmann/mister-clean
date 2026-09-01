# Security

Mister Clean's public MCP surface is read-only. It serves the skill materials
and does not receive repository access, credentials, or authority to act on a
client's machine.

The installed `@bradheitmann/mister-clean/control-plane` surface is a different,
local-only boundary. It runs under Bun, opens operator-selected SQLite files,
and may bind a Unix socket or loopback HTTP listener protected by a bearer
token. Keep that token out of Git, reports, prompts, logs, and process arguments;
protect the database and socket with host filesystem permissions. The public
function accepts exact own transport fields only. Inherited fields and public
injection of route admission, evidence verification, clocks, stores, services,
authenticators, or adapters are rejected or ignored before they can acquire
authority. Its returned handle always reports dispatch and execution support as
false.

The package export map is a supported-capability boundary, not a sandbox against
an actor that already has arbitrary filesystem or code-execution access. Deep
package imports are blocked for ordinary consumers, but local host security and
repository ownership remain the real trust boundary.

The release capsule passes child processes an explicit locator-only environment:
executable lookup may cross the boundary, while writable homes, caches, temporary
directories, package-manager state, and Git configuration are rebased inside the
capsule. Parent credentials, proxies, hook variables, source working-directory
markers, and runtime injection flags are not release-build inputs.

The installed CLI, stdio MCP entrypoint, and root package export fail closed when
their attested package bytes drift. The public HTTP worker cannot make that
filesystem claim; its `bundled_content` attestation is deliberately limited to
the digest and count of the canonical material table compiled into the worker.
The local control-plane bytes are covered by the package manifest and claim
scope and have independent source, built-package, and packed-consumer gates.
`./dist/control-plane.js` is not a required entrypoint, and the control-plane
runtime performs no runtime-attestation binding before use. Neither form is a
registry-publication receipt or a dependency-graph attestation.

Schema-1.5 CLEAN evidence must match a live verifier-minted capability for the
exact installed release manifest and CLI entrypoint. Serialized identity JSON,
source-development execution, and the HTTP worker's bundled-content identity
cannot establish that claim. A release operation reads the named archive once
through a no-follow descriptor, verifies that open file did not change, and
moves all later authority to an exclusive private custody copy. Raw USTAR paths,
payloads, manifest closure, extraction, install smoke, and publication therefore
refer to one byte string even if the caller-visible path is replaced. This
custody proves byte identity, not capsule origin. The receipt is self-issued,
not a signature. Publication authority is the conjunction of an
operator-trusted capsule origin and exact archive verification against npmjs.
Never execute a retained publisher from an untrusted capsule, and permit exactly
one authorized publication lane per package name and version.

Do not send secrets, private source code, or proprietary repository contents
to the public endpoint. Run the bundled local scripts inside your own trusted
environment. Report a suspected vulnerability through a private security
advisory on the GitHub repository rather than a public issue.
