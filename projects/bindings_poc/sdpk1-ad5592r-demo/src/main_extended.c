/***************************************************************************//**
 *   @file   main.c
 *   @brief  Main file for SDP-K1 + AD5592R demo.
 *   @author Demo Project
********************************************************************************
 * Copyright 2024(c) Analog Devices, Inc.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 *    this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 *    this list of conditions and the following disclaimer in the documentation
 *    and/or other materials provided with the distribution.
 *
 * 3. Neither the name of Analog Devices, Inc. nor the names of its
 *    contributors may be used to endorse or promote products derived from this
 *    software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY ANALOG DEVICES, INC. "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO
 * EVENT SHALL ANALOG DEVICES, INC. BE LIABLE FOR ANY DIRECT, INDIRECT,
 * INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA,
 * OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
 * LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 * NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE,
 * EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*******************************************************************************/

#include "common_data.h"
#include "ad5592r.h"
#include "no_os_print_log.h"

/***************************************************************************//**
 * @brief Main function - initializes UART and AD5592R, demos DAC/ADC.
 *
 * @return 0 on success, negative error code on failure.
*******************************************************************************/
int main(void)
{
	struct no_os_uart_desc *uart_desc;
	struct ad5592r_dev *ad5592r_dev;
	uint16_t adc_value;
	int ret;
	int i;

	/* Initialize UART for debug output */
	ret = no_os_uart_init(&uart_desc, &uart_ip);
	if (ret) {
		return ret;
	}

	no_os_uart_stdio(uart_desc);

	pr_info("SDP-K1 + AD5592R Demo\n");
	pr_info("=====================\n\n");

	/* Initialize AD5592R */
	ret = ad5592r_init(&ad5592r_dev, &ad5592r_ip);
	if (ret) {
		pr_info("AD5592R init failed: %d\n", ret);
		goto error_uart;
	}

	pr_info("AD5592R initialized successfully\n");
	pr_info("  Channels 0-3: DAC outputs\n");
	pr_info("  Channels 4-7: ADC inputs\n\n");

	/* Demo: Write ramp values to DAC channels */
	pr_info("Writing DAC values:\n");
	for (i = 0; i < 4; i++) {
		uint16_t dac_value = (i + 1) * 1000;
		ret = ad5592r_write_dac(ad5592r_dev, i, dac_value);
		if (ret) {
			pr_info("  DAC write to channel %d failed: %d\n", i, ret);
		} else {
			pr_info("  Channel %d: %d (0x%03X)\n", i, dac_value, dac_value);
		}
	}

	pr_info("\nReading ADC values:\n");
	for (i = 4; i < 8; i++) {
		ret = ad5592r_read_adc(ad5592r_dev, i, &adc_value);
		if (ret) {
			pr_info("  ADC read from channel %d failed: %d\n", i, ret);
		} else {
			pr_info("  Channel %d: %d (0x%03X)\n", i, adc_value, adc_value);
		}
	}

	pr_info("\nDemo complete.\n");

	ad5592r_remove(ad5592r_dev);

error_uart:
	no_os_uart_remove(uart_desc);
	return ret;
}
