// ╔══════════════════════════════════════════════════════════════════╗
// ║  BTNG ANDROID SDK — UBL-1.0                                     ║
// ║  Kotlin · OkHttp · Drop into any Android banking app           ║
// ╚══════════════════════════════════════════════════════════════════╝
//
// GRADLE (app/build.gradle):
//   implementation("com.squareup.okhttp3:okhttp:4.12.0")
//
// USAGE:
//   val btng = BTNGClient("https://btng-bank.yourdomain.com")
//   btng.getWallet("BTNG-1234-5678") { json -> /* update UI */ }

package com.btng.sdk

import okhttp3.*
import okhttp3.MediaType.Companion.toMediaTypeOrNull
import org.json.JSONObject
import java.io.IOException

private const val UBL_VERSION   = "UBL-1.0"
private const val CLIENT_TAG    = "android-native"
private const val GOLD_SYMBOL   = "BTNGG"
private const val CHAIN_PREFIX  = "btng1"
private const val BASE_RATE_APR = 0.08
private const val MAX_LTV       = 0.70

class BTNGClient(private val baseUrl: String) {

    private val JSON_TYPE = "application/json; charset=utf-8".toMediaTypeOrNull()

    private val http = OkHttpClient.Builder()
        .addInterceptor { chain ->
            val req = chain.request().newBuilder()
                .addHeader("X-BTNG-Client", CLIENT_TAG)
                .addHeader("X-BTNG-UBL",    UBL_VERSION)
                .addHeader("X-BTNG-Chain",   CHAIN_PREFIX)
                .build()
            chain.proceed(req)
        }
        .build()

    // ── Wallet Lookup ────────────────────────────────────────────
    fun getWallet(btngId: String, callback: (JSONObject?) -> Unit) {
        val req = Request.Builder()
            .url("$baseUrl/wallet/$btngId")
            .get()
            .build()

        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = callback(null)
            override fun onResponse(call: Call, response: Response) {
                response.use { callback(parseJson(it.body?.string())) }
            }
        })
    }

    // ── Loan Quote ───────────────────────────────────────────────
    fun loanQuote(
        btngId: String,
        principal: Double,
        days: Int,
        callback: (JSONObject?) -> Unit
    ) {
        val payload = JSONObject().apply {
            put("btng_id",    btngId)
            put("principal",  principal)
            put("days",       days)
        }
        post("/loan/quote", payload, callback)
    }

    // ── Card Activation ──────────────────────────────────────────
    fun activateCard(
        btngId:   String,
        wallet:   String,
        expires:  String? = null,
        callback: (JSONObject?) -> Unit
    ) {
        val payload = JSONObject().apply {
            put("btng_id", btngId)
            put("wallet",  wallet)
            expires?.let { put("expires", it) }
        }
        post("/card/activate", payload, callback)
    }

    // ── Identity Register ────────────────────────────────────────
    fun registerIdentity(
        btngId:   String,
        wallet:   String,
        expires:  String,
        callback: (JSONObject?) -> Unit
    ) {
        val payload = JSONObject().apply {
            put("btng_id", btngId)
            put("wallet",  wallet)
            put("expires", expires)
        }
        post("/identity", payload, callback)
    }

    // ── Local Loan Quote (offline fallback) ──────────────────────
    fun localLoanQuote(btngId: String, principal: Double, days: Int): JSONObject {
        val maxBorrow  = principal * MAX_LTV
        val dailyRate  = BASE_RATE_APR / 365.0
        val interest   = maxBorrow * dailyRate * days
        val risk       = when {
            principal > 50000 -> "HIGH"
            principal > 10000 -> "MEDIUM"
            else              -> "LOW"
        }
        return JSONObject().apply {
            put("btng_id",    btngId)
            put("principal",  principal)
            put("max_borrow", Math.round(maxBorrow * 100.0) / 100.0)
            put("interest",   Math.round(interest  * 100.0) / 100.0)
            put("total_due",  Math.round((maxBorrow + interest) * 100.0) / 100.0)
            put("currency",   GOLD_SYMBOL)
            put("rate_apr",   BASE_RATE_APR)
            put("ltv",        MAX_LTV)
            put("risk_level", risk)
            put("source",     "local")
        }
    }

    // ── Private helpers ──────────────────────────────────────────
    private fun post(path: String, payload: JSONObject, callback: (JSONObject?) -> Unit) {
        val body = RequestBody.create(JSON_TYPE, payload.toString())
        val req  = Request.Builder().url("$baseUrl$path").post(body).build()
        http.newCall(req).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) = callback(null)
            override fun onResponse(call: Call, response: Response) {
                response.use { callback(parseJson(it.body?.string())) }
            }
        })
    }

    private fun parseJson(body: String?): JSONObject? =
        if (body != null) try { JSONObject(body) } catch (e: Exception) { null } else null
}
