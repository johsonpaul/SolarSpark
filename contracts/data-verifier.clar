;; DataVerifier Smart Contract
;; Validates solar usage data submissions against oracle or IoT sensor inputs.
;; Integrates with DataSubmission contract to ensure data integrity for SolarSpark rewards.
;; Features: oracle management, validation history, quality scoring, pausing, admin controls, and event emissions.

;; Traits
(define-trait data-submission-trait
  (
    (get-data-hash (uint) (response (buff 32) uint))
    (get-data-submitter (uint) (response principal uint))
    (get-data-timestamp (uint) (response uint uint))
  )
)

;; Constants
(define-constant CONTRACT_OWNER tx-sender)
(define-constant ERR_NOT_AUTHORIZED (err u100))
(define-constant ERR_INVALID_DATA (err u101))
(define-constant ERR_PAUSED (err u102))
(define-constant ERR_INVALID_ORACLE (err u103))
(define-constant ERR_ALREADY_VALIDATED (err u104))
(define-constant ERR_INVALID_QUALITY (err u105))
(define-constant ERR_INVALID_TIMESTAMP (err u106))
(define-constant MAX_QUALITY_SCORE u100)
(define-constant VALIDATION_WINDOW u288) ;; ~2 days in blocks (144 blocks/day)
(define-constant MAX_ORACLES u5) ;; Max allowed oracles

;; Data Variables
(define-data-var contract-paused bool false)
(define-data-var admin principal CONTRACT_OWNER)
(define-data-var data-submission-contract principal 'SP3K8BC0PPEVCV7NZ6QSRWPQ2JE9E5B6N3PA0KBR9.data-submission)
(define-data-var oracle-count uint u0)

;; Maps
(define-map oracles principal {active: bool, added-at: uint, validation-count: uint})
(define-map data-validity uint {is-valid: bool, quality-score: uint, validator: principal, timestamp: uint})
(define-map user-validation-history principal (list 100 uint)) ;; Tracks validated data IDs per user
(define-map oracle-validations principal (list 100 uint)) ;; Tracks data IDs validated by each oracle
(define-map daily-validations uint uint) ;; Total validations per day (block height / 144)

;; Private Functions
(define-private (emit-validation-event (data-id uint) (user principal) (is-valid bool) (quality-score uint))
  (print 
    {
      event: "data-validated",
      data-id: data-id,
      user: user,
      is-valid: is-valid,
      quality-score: quality-score,
      block-height: block-height,
      validator: tx-sender
    }
  )
)

(define-private (is-oracle-active (oracle principal))
  (let ((oracle-info (default-to {active: false, added-at: u0, validation-count: u0} (map-get? oracles oracle))))
    (get active oracle-info)
  )
)

(define-private (is-within-validation-window (data-timestamp uint) (current-block uint))
  (<= (- current-block data-timestamp) VALIDATION_WINDOW)
)

(define-private (update-validation-stats (data-id uint) (oracle principal))
  (let ((oracle-info (unwrap-panic (map-get? oracles oracle)))
        (day (/ block-height u144)))
    (map-set oracles oracle 
      (merge oracle-info {validation-count: (+ (get validation-count oracle-info) u1)}))
    (map-set daily-validations day 
      (+ (default-to u0 (map-get? daily-validations day)) u1))
    (ok true)
  )
)

;; Public Functions
(define-public (verify-data (data-id uint) (oracle-data-hash (buff 32)) (quality-score uint))
  (let ((oracle tx-sender)
        (current-block block-height))
    (asserts! (not (var-get contract-paused)) ERR_PAUSED)
    (asserts! (is-oracle-active oracle) ERR_NOT_AUTHORIZED)
    (asserts! (<= quality-score MAX_QUALITY_SCORE) ERR_INVALID_QUALITY)
    (match (map-get? data-validity data-id)
      existing (err ERR_ALREADY_VALIDATED)
      (let ((submitted-hash (unwrap! (as-contract (contract-call? .data-submission get-data-hash data-id)) ERR_INVALID_DATA))
            (submitter (unwrap! (as-contract (contract-call? .data-submission get-data-submitter data-id)) ERR_INVALID_DATA))
            (data-timestamp (unwrap! (as-contract (contract-call? .data-submission get-data-timestamp data-id)) ERR_INVALID_DATA)))
        (asserts! (is-within-validation-window data-timestamp current-block) ERR_INVALID_TIMESTAMP)
        (asserts! (is-eq submitted-hash oracle-data-hash) ERR_INVALID_DATA)
        (map-set data-validity data-id 
          {is-valid: true, quality-score: quality-score, validator: oracle, timestamp: current-block})
        (map-set user-validation-history submitter 
          (append (default-to (list) (map-get? user-validation-history submitter)) data-id))
        (map-set oracle-validations oracle 
          (append (default-to (list) (map-get? oracle-validations oracle)) data-id))
        (try! (update-validation-stats data-id oracle))
        (emit-validation-event data-id submitter true quality-score)
        (ok true))))
)

(define-public (invalidate-data (data-id uint))
  (let ((oracle tx-sender)
        (current-block block-height))
    (asserts! (not (var-get contract-paused)) ERR_PAUSED)
    (asserts! (is-oracle-active oracle) ERR_NOT_AUTHORIZED)
    (match (map-get? data-validity data-id)
      existing (err ERR_ALREADY_VALIDATED)
      (let ((submitter (unwrap! (as-contract (contract-call? .data-submission get-data-submitter data-id)) ERR_INVALID_DATA))
            (data-timestamp (unwrap! (as-contract (contract-call? .data-submission get-data-timestamp data-id)) ERR_INVALID_DATA)))
        (asserts! (is-within-validation-window data-timestamp current-block) ERR_INVALID_TIMESTAMP)
        (map-set data-validity data-id 
          {is-valid: false, quality-score: u0, validator: oracle, timestamp: current-block})
        (map-set user-validation-history submitter 
          (append (default-to (list) (map-get? user-validation-history submitter)) data-id))
        (map-set oracle-validations oracle 
          (append (default-to (list) (map-get? oracle-validations oracle)) data-id))
        (try! (update-validation-stats data-id oracle))
        (emit-validation-event data-id submitter false u0)
        (ok true))))
)

;; Admin Functions
(define-public (add-oracle (oracle principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_AUTHORIZED)
    (asserts! (< (var-get oracle-count) MAX_ORACLES) ERR_INVALID_ORACLE)
    (match (map-get? oracles oracle)
      existing (asserts! (not (get active existing)) ERR_INVALID_ORACLE)
      (begin
        (map-set oracles oracle 
          {active: true, added-at: block-height, validation-count: u0})
        (var-set oracle-count (+ (var-get oracle-count) u1))
        (print {event: "oracle-added", oracle: oracle, block-height: block-height})
        (ok true))))
)

(define-public (remove-oracle (oracle principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_AUTHORIZED)
    (asserts! (is-oracle-active oracle) ERR_INVALID_ORACLE)
    (map-set oracles oracle 
      (merge (unwrap-panic (map-get? oracles oracle)) {active: false}))
    (var-set oracle-count (- (var-get oracle-count) u1))
    (print {event: "oracle-removed", oracle: oracle, block-height: block-height})
    (ok true))
)

(define-public (pause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_AUTHORIZED)
    (var-set contract-paused true)
    (print {event: "contract-paused", block-height: block-height})
    (ok true)
  )
)

(define-public (unpause-contract)
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_AUTHORIZED)
    (var-set contract-paused false)
    (print {event: "contract-unpaused", block-height: block-height})
    (ok true)
  )
)

(define-public (set-data-submission-contract (new-contract principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) ERR_NOT_AUTHORIZED)
    (var-set data-submission-contract new-contract)
    (ok true)
  )
)

;; Read-Only Functions
(define-read-only (is-data-valid (data-id uint))
  (match (map-get? data-validity data-id)
    entry (ok (get is-valid entry))
    (ok false))
)

(define-read-only (get-data-quality (data-id uint))
  (match (map-get? data-validity data-id)
    entry (ok (get quality-score entry))
    (err ERR_INVALID_DATA))
)

(define-read-only (get-validation-details (data-id uint))
  (map-get? data-validity data-id)
)

(define-read-only (get-user-validation-history (user principal))
  (ok (default-to (list) (map-get? user-validation-history user)))
)

(define-read-only (get-oracle-validations (oracle principal))
  (ok (default-to (list) (map-get? oracle-validations oracle)))
)

(define-read-only (get-daily-validations (day uint))
  (ok (default-to u0 (map-get? daily-validations day)))
)

(define-read-only (is-oracle (oracle principal))
  (ok (is-oracle-active oracle))
)

(define-read-only (get-oracle-count)
  (ok (var-get oracle-count))
)