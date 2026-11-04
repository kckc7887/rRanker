#include <jni.h>
#include <dlfcn.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

JNIEXPORT jbyteArray JNICALL
Java_expo_modules_maimaisave_MaimaiSaveModule_nativeRead(JNIEnv *env, jobject instance, jbyteArray input) {
    (void)instance;
    void *library = dlopen("libmaimai_tech.so", RTLD_NOW | RTLD_LOCAL);
    if (!library) return NULL;
    uint32_t (*version)(void) = dlsym(library, "maimai_abi_version");
    char *(*call)(const char *) = dlsym(library, "maimai_call");
    void (*release)(char *) = dlsym(library, "maimai_string_free");
    jbyteArray output = NULL;
    if (version && call && release && version() == 1) {
        jsize length = (*env)->GetArrayLength(env, input);
        char *request = malloc((size_t)length + 1);
        if (request) {
            (*env)->GetByteArrayRegion(env, input, 0, length, (jbyte *)request);
            request[length] = '\0';
            if (!(*env)->ExceptionCheck(env)) {
                char *result = call(request);
                if (result) {
                    size_t size = strlen(result);
                    if (size <= INT32_MAX) {
                        output = (*env)->NewByteArray(env, (jsize)size);
                        if (output) (*env)->SetByteArrayRegion(env, output, 0, (jsize)size, (const jbyte *)result);
                    }
                    release(result);
                }
            }
            free(request);
        }
    }
    dlclose(library);
    return output;
}
